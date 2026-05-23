"""Thin async wrapper over the google-genai SDK.

Conversation history is stored as a uniform list of typed
`google.genai.types.Content` objects. Mixing dict and Content in the
list breaks tool-use multi-turn flows (the SDK fails to round-trip
fields like `thought_signature` on function_call parts).

Helpers:
  - make_user_text         : Content for a plain user prompt
  - make_user_function_response : Content carrying tool results
  - model_turn_for_history : the raw Content from a model response

If the SDK is missing or the API key isn't set, a deterministic mock
takes over so the SSE pipeline still streams end-to-end.
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from core.config import settings


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


@dataclass
class GenResponse:
    text: str | None
    function_call: dict[str, Any] | None  # {"name": str, "args": dict}
    raw_content: Any | None = None  # original candidate.content (Content)


# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------


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

            self._client = genai.Client(api_key=api_key)
        except Exception:
            self._mock = True

    @property
    def is_mock(self) -> bool:
        return self._mock

    # ------------------------------------------------------------------

    async def generate(
        self,
        system_prompt: str,
        history: list[Any],
        tools: list[dict[str, Any]] | None = None,
    ) -> GenResponse:
        if self._mock:
            return self._mock_generate(history, tools)

        from google.genai import types  # type: ignore

        cfg_kwargs: dict[str, Any] = {"system_instruction": system_prompt}
        _apply_no_thinking(cfg_kwargs, types)
        if tools:
            cfg_kwargs["tools"] = [
                types.Tool(function_declarations=[_build_function_declaration(t, types) for t in tools])
            ]

        def _call() -> Any:
            return self._client.models.generate_content(
                model=settings.gemini_model,
                contents=history,
                config=types.GenerateContentConfig(**cfg_kwargs),
            )

        response = await asyncio.to_thread(_call)
        return _parse_response(response)

    async def stream_text(
        self,
        system_prompt: str,
        history: list[Any],
    ) -> AsyncIterator[str]:
        if self._mock:
            async for chunk in self._mock_stream(history):
                yield chunk
            return

        from google.genai import types  # type: ignore

        def _stream() -> Any:
            cfg_kwargs: dict[str, Any] = {"system_instruction": system_prompt}
            _apply_no_thinking(cfg_kwargs, types)
            return self._client.models.generate_content_stream(
                model=settings.gemini_model,
                contents=history,
                config=types.GenerateContentConfig(**cfg_kwargs),
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

    def _mock_generate(self, history: list[Any], tools: list[dict[str, Any]] | None) -> GenResponse:
        last_user_text = _extract_last_user_text(history)
        already_called = _history_has_function_response(history)

        if tools and not already_called:
            preferred = tools[0]["name"]
            return GenResponse(text=None, function_call={"name": preferred, "args": {}})
        return GenResponse(
            text=f"(mock without GEMINI_API_KEY) Acknowledged: {last_user_text[:160]}",
            function_call=None,
        )

    async def _mock_stream(self, history: list[Any]) -> AsyncIterator[str]:
        last = _extract_last_user_text(history)
        words = (
            "(mock orchestrator without GEMINI_API_KEY) I would coordinate the "
            f"inventory, cost, and deploy sub-agents to answer: {last}. "
            "Set GEMINI_API_KEY in backend/.env to see the real Gemini response."
        ).split(" ")
        for w in words:
            await asyncio.sleep(0.02)
            yield w + " "


# ---------------------------------------------------------------------------
# Content builders (always return typed objects when SDK is available)
# ---------------------------------------------------------------------------


def make_user_text(text: str) -> Any:
    try:
        from google.genai import types  # type: ignore

        return types.Content(role="user", parts=[types.Part(text=text)])
    except Exception:
        return {"role": "user", "parts": [{"text": text}]}


def make_user_function_response(name: str, response: dict[str, Any]) -> Any:
    try:
        from google.genai import types  # type: ignore

        return types.Content(
            role="user",
            parts=[types.Part(function_response=types.FunctionResponse(name=name, response=response))],
        )
    except Exception:
        return {"role": "user", "parts": [{"function_response": {"name": name, "response": response}}]}


def model_turn_for_history(response: GenResponse) -> Any:
    """Return the model's turn for history append. Prefers the raw Content
    captured from the response so all internal fields (thought_signature
    included) round-trip exactly as the model emitted them."""
    if response.raw_content is not None:
        return response.raw_content
    part: dict[str, Any] = {}
    if response.function_call is not None:
        part["function_call"] = response.function_call
    if response.text:
        part["text"] = response.text
    return {"role": "model", "parts": [part]}


# ---------------------------------------------------------------------------
# Tool-spec → FunctionDeclaration
# ---------------------------------------------------------------------------


_TYPE_MAP = {
    "string": "STRING", "number": "NUMBER", "integer": "INTEGER",
    "boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
}


def _schema_from_dict(d: Any, types_module: Any) -> Any:
    """Convert a JSON-Schema-style dict to types.Schema."""
    if not isinstance(d, dict):
        return d
    kwargs: dict[str, Any] = {}
    for k, v in d.items():
        if k == "type" and isinstance(v, str):
            kwargs["type"] = _TYPE_MAP.get(v.lower(), v.upper())
        elif k == "properties" and isinstance(v, dict):
            kwargs["properties"] = {pk: _schema_from_dict(pv, types_module) for pk, pv in v.items()}
        elif k == "items" and isinstance(v, dict):
            kwargs["items"] = _schema_from_dict(v, types_module)
        elif k in ("required", "enum") and isinstance(v, list):
            kwargs[k] = v
        elif k == "description" and isinstance(v, str):
            kwargs["description"] = v
    return types_module.Schema(**kwargs)


def _build_function_declaration(tool: dict[str, Any], types_module: Any) -> Any:
    params_dict = tool.get("parameters") or {"type": "object", "properties": {}}
    return types_module.FunctionDeclaration(
        name=tool["name"],
        description=tool.get("description", ""),
        parameters=_schema_from_dict(params_dict, types_module),
    )


def _apply_no_thinking(config_kwargs: dict[str, Any], types_module: Any) -> None:
    """Disable thinking on Gemini 2.5/3.5 so the multi-turn loop is robust
    even if a typed Content somehow loses its thought_signature."""
    ThinkingConfig = getattr(types_module, "ThinkingConfig", None)
    if ThinkingConfig is None:
        return
    try:
        config_kwargs["thinking_config"] = ThinkingConfig(thinking_budget=0)
    except Exception:
        try:
            config_kwargs["thinking_config"] = ThinkingConfig(include_thoughts=False)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def _parse_response(response: Any) -> GenResponse:
    try:
        candidate = response.candidates[0]
        raw_content = getattr(candidate, "content", None)
        if raw_content is not None:
            for part in raw_content.parts or []:
                fc = getattr(part, "function_call", None)
                if fc and getattr(fc, "name", None):
                    args: dict[str, Any] = {}
                    raw_args = getattr(fc, "args", None)
                    if raw_args:
                        try:
                            args = dict(raw_args)
                        except Exception:
                            args = {}
                    return GenResponse(
                        text=None,
                        function_call={"name": fc.name, "args": args},
                        raw_content=raw_content,
                    )
        text = getattr(response, "text", None) or ""
        return GenResponse(text=text, function_call=None, raw_content=raw_content)
    except Exception:
        return GenResponse(text=str(response), function_call=None)


# ---------------------------------------------------------------------------
# History helpers (work with both Content and dict-form items)
# ---------------------------------------------------------------------------


def _extract_last_user_text(history: list[Any]) -> str:
    for item in reversed(history):
        role = _role_of(item)
        if role != "user":
            continue
        text = _first_text_part(item)
        if text:
            return text
    return ""


def _history_has_function_response(history: list[Any]) -> bool:
    for item in history:
        for part in _parts_of(item):
            if _part_has_function_response(part):
                return True
    return False


def _role_of(item: Any) -> str:
    if isinstance(item, dict):
        return item.get("role", "")
    return getattr(item, "role", "") or ""


def _parts_of(item: Any) -> list[Any]:
    if isinstance(item, dict):
        return item.get("parts", []) or []
    return getattr(item, "parts", None) or []


def _first_text_part(item: Any) -> str:
    for part in _parts_of(item):
        if isinstance(part, dict):
            t = part.get("text")
            if t:
                return t
        else:
            t = getattr(part, "text", None)
            if t:
                return t
    return ""


def _part_has_function_response(part: Any) -> bool:
    if isinstance(part, dict):
        return "function_response" in part
    return getattr(part, "function_response", None) is not None
