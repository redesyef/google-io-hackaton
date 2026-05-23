from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import auth, chat, gcp
from core.config import settings

app = FastAPI(title="CloudCanvas API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(gcp.router)
app.include_router(chat.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.gemini_model}
