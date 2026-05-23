"""Thin async wrapper over the google-genai SDK.

Exposes two methods used by the agents:
  - generate(): single-turn generation (used inside sub-agent tool loops)
  - stream_text(): token streaming (used for the orchestrator's final answer)

If the SDK is unavailable or the API key is missing, the backend falls back
to a deterministic mock so the SSE pipeline still works end-to-end during
development without a key.
"""
from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from core.config import settings


@dataclass
class GenResponse:
    text: str | None
    function_call: dict[str, Any] | None  # {"name": str, "args": dict}


class GeminiBackend:
    def __init__(self) -> None:
        self._client: Any | None = None
        self._mock = False
        api_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            self._mock = True
            return
        try:
            from google import genai  # type: ignore

            self._genai = genai
            self._client = genai.Client(api_key=api_key)
        except Exception:
            self._mock = True

    @property
    def is_mock(self) -> bool:
        return self._mock

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    async def generate(
        self,
        system_prompt: str,
        history: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> GenResponse:
        if self._mock:
            return self._mock_generate(history, tools)

        from google.genai import types  # type: ignore

        config_kwargs: dict[str, Any] = {"system_instruction": system_prompt}
        if tools:
            normalized = [_normalize_tool(t) for t in tools]
            config_kwargs["tools"] = [
                types.Tool(function_declarations=[types.FunctionDeclaration(**t) for t in normalized])
            ]

        def _call() -> Any:
            return self._client.models.generate_content(
                model=settings.gemini_model,
                contents=history,
                config=types.GenerateContentConfig(**config_kwargs),
            )

        response = await asyncio.to_thread(_call)
        return _parse_response(response)

    async def stream_text(
        self,
        system_prompt: str,
        history: list[dict[str, Any]],
    ) -> AsyncIterator[str]:
        if self._mock:
            async for chunk in self._mock_stream(history):
                yield chunk
            return

        from google.genai import types  # type: ignore

        def _stream() -> Any:
            return self._client.models.generate_content_stream(
                model=settings.gemini_model,
                contents=history,
                config=types.GenerateContentConfig(system_instruction=system_prompt),
            )

        stream = await asyncio.to_thread(_stream)
        loop = asyncio.get_event_loop()

        def _iter() -> Any:
            for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    yield text

        gen = _iter()
        while True:
            chunk = await loop.run_in_executor(None, lambda: next(gen, None))
            if chunk is None:
                return
            yield chunk

    # ------------------------------------------------------------------
    # Mock fallback (no API key)
    # ------------------------------------------------------------------

    def _mock_generate(self, history: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> GenResponse:
        last_user_text = ""
        for msg in reversed(history):
            if msg.get("role") == "user":
                for part in msg.get("parts", []):
                    if "text" in part:
                        last_user_text = part["text"]
                        break
                if last_user_text:
                    break

        already_called = any(
            "function_response" in part
            for msg in history
            for part in msg.get("parts", [])
        )

        if tools and not already_called:
            preferred = tools[0]["name"]
            return GenResponse(text=None, function_call={"name": preferred, "args": {}})

        return GenResponse(
            text=f"(mock without GEMINI_API_KEY) Acknowledged: {last_user_text[:160]}",
            function_call=None,
        )

    async def _mock_stream(self, history: list[dict[str, Any]]) -> AsyncIterator[str]:
        last = ""
        for msg in reversed(history):
            if msg.get("role") == "user":
                for part in msg.get("parts", []):
                    if "text" in part:
                        last = part["text"]; break
                if last: break
        words = (
            "(mock orchestrator without GEMINI_API_KEY) I would coordinate the "
            f"inventory, cost, and deploy sub-agents to answer: {last}. "
            "Set GEMINI_API_KEY in backend/.env to see the real Gemini 3.5 Flash response."
        ).split(" ")
        for w in words:
            await asyncio.sleep(0.02)
            yield w + " "


_TYPE_MAP = {
    "string": "STRING",
    "number": "NUMBER",
    "integer": "INTEGER",
    "boolean": "BOOLEAN",
    "array": "ARRAY",
    "object": "OBJECT",
}


def _normalize_schema(schema: Any) -> Any:
    """Recursively uppercase JSON-Schema 'type' fields for google-genai.

    The SDK validates `type` against an enum of upper-case literals
    (STRING, OBJECT, ...). We author tool specs in lowercase JSON-Schema
    convention and translate at the SDK boundary.
    """
    if isinstance(schema, dict):
        out: dict[str, Any] = {}
        for k, v in schema.items():
            if k == "type" and isinstance(v, str) and v.lower() in _TYPE_MAP:
                out[k] = _TYPE_MAP[v.lower()]
            else:
                out[k] = _normalize_schema(v)
        return out
    if isinstance(schema, list):
        return [_normalize_schema(x) for x in schema]
    return schema


def _normalize_tool(tool: dict[str, Any]) -> dict[str, Any]:
    out = dict(tool)
    if "parameters" in out:
        out["parameters"] = _normalize_schema(out["parameters"])
    return out


def _parse_response(response: Any) -> GenResponse:
    try:
        candidate = response.candidates[0]
        for part in candidate.content.parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None):
                args = {}
                raw_args = getattr(fc, "args", None)
                if raw_args:
                    try:
                        args = dict(raw_args)
                    except Exception:
                        try:
                            args = json.loads(str(raw_args))
                        except Exception:
                            args = {}
                return GenResponse(text=None, function_call={"name": fc.name, "args": args})
        text = getattr(response, "text", None) or ""
        return GenResponse(text=text, function_call=None)
    except Exception:
        return GenResponse(text=str(response), function_call=None)
