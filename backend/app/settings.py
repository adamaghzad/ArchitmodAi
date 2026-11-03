import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

ROLE_DEFAULTS = {
    "requirements": "qwen3.5:4b",
    "supervisor": "qwen3.5:4b",
    "furniture": "qwen3.5:4b",
    "materials": "qwen3.5:4b",
    "design": "qwen3:8b",
    "correction": "qwen3:8b",
    "vision": "llava:latest",
    "embedding": "embeddinggemma:latest",
}


def model_for(role: str) -> str:
    return os.getenv(f"OLLAMA_{role.upper()}_MODEL", ROLE_DEFAULTS[role]).strip()


def ollama_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
