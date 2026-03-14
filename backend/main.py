"""
DevilCreations AI - FastAPI Backend (Production)
Handles image generation via NVIDIA (Flux.1-dev) and OpenRouter (Flux.2-max) APIs.
Serves the static frontend in production. API keys are kept server-side.
"""

import os
import json
import base64
import logging
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

# Parse comma-separated origins for CORS
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in FRONTEND_ORIGIN.split(",")
    if origin.strip()
]
# Always include the known production origins
ALLOWED_ORIGINS.append("https://devilcreations-ai.onrender.com")
ALLOWED_ORIGINS.append("https://antongino.github.io")
# Also pick up Render's auto-injected external URL
RENDER_URL = os.getenv("RENDER_EXTERNAL_URL", "")
if RENDER_URL and RENDER_URL not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(RENDER_URL)

# Sensitive words list
SENSITIVE_WORDS: list[str] = [
    "abuse", "addict", "adultery", "assault", "autism", "bastard", "bitch",
    "bimbo", "bastards", "bloodbath", "blowjob", "bollocks", "boobs", "bully",
    "cancer", "cocksucker", "cock", "crack", "creep", "cunt", "cuntface",
    "cyberbully", "dildo", "douche", "drugs", "dyke", "fag", "faggot",
    "fatass", "fuck", "fucker", "fuckhead", "fucking", "fucktard", "gangbang",
    "gay", "gimp", "gore", "hate", "hell", "hitman", "homo", "horrible",
    "hooker", "homophobic", "idiot", "impo", "incest", "jackass", "jizz",
    "kike", "kunt", "lesbian", "libido", "masturbate", "masturbation",
    "molest", "moron", "murder", "nazi", "nigger", "penis", "porn",
    "prostitute", "rape", "retard", "rimjob", "scam", "scumbag", "sex",
    "sexy", "slut", "sodomy", "spastic", "spic", "stupid", "suicide",
    "swallow", "twat", "vagina", "violence", "whore", "wimp", "wanker",
    "wanking", "yobbo", "zombie", "asshole", "anal", "anger", "anorexic",
    "arsehole", "assfucker", "backdoor", "ballbag", "bastardized", "bitches",
    "boil", "butt", "buz", "clitoris", "condom", "crackhead", "cum",
    "defecate", "diarrhea", "dumbass", "erection", "faggotry", "fellatio",
    "fisting", "fornicate", "gangsta", "gash", "hardcore", "herpes", "ho",
    "homoerotic", "huff", "infantile", "jerkoff", "labia", "masturbatory",
    "orgasm", "pedophile", "pornography", "porno", "pornographic", "prick",
    "puppykiller", "quiff", "satan", "screwing", "sexual", "shit", "shitted",
    "sonofabitch", "suck", "teabag", "testicles", "virgin", "vulgar",
    "wetback", "wiener", "zits", "tits", "pussy", "ass", "fuckface",
]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("devilcreations")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="DevilCreations AI Backend",
    version="2.0.0",
    description="Backend proxy for AI image generation",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(default="flux-1-dev", pattern="^(flux-1-dev|flux-2-max)$")
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    steps: int = Field(default=50, ge=1, le=100)
    cfg_scale: float = Field(default=3.5, ge=1.0, le=20.0)
    seed: Optional[int] = Field(default=0)


class GenerateResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    image_base64: str
    content_type: str
    model_used: str


class SensitiveWordsResponse(BaseModel):
    words: list[str]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def contains_sensitive_words(prompt: str) -> bool:
    """Check if the prompt contains any sensitive words."""
    prompt_words = prompt.lower().split()
    return any(word.lower() in prompt_words for word in SENSITIVE_WORDS)


async def generate_nvidia_flux1dev(
    prompt: str, width: int, height: int, steps: int, cfg_scale: float, seed: int
) -> tuple[str, str]:
    """Call NVIDIA Flux.1-dev API. Returns (base64_image_data, content_type)."""
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA API key is not configured on the server.")

    invoke_url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev"
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
    }
    payload = {
        "prompt": prompt,
        "mode": "base",
        "cfg_scale": cfg_scale,
        "width": width,
        "height": height,
        "seed": seed,
        "steps": steps,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(invoke_url, headers=headers, json=payload)

    if response.status_code != 200:
        logger.error(f"NVIDIA API error {response.status_code}: {response.text[:500]}")
        raise HTTPException(
            status_code=502,
            detail=f"NVIDIA API returned status {response.status_code}",
        )

    body = response.json()

    # NVIDIA may return in various formats — handle them all
    if "artifacts" in body and len(body["artifacts"]) > 0:
        img_b64 = body["artifacts"][0].get("base64", "")
        return img_b64, "image/png"
    elif "image" in body:
        img_data = body["image"]
        if img_data.startswith("data:"):
            parts = img_data.split(",", 1)
            ct = parts[0].split(":")[1].split(";")[0] if ":" in parts[0] else "image/png"
            return parts[1], ct
        return img_data, "image/png"
    else:
        logger.warning(f"Unexpected NVIDIA response keys: {list(body.keys())}")
        for key, value in body.items():
            if isinstance(value, str) and len(value) > 100:
                return value, "image/png"
        raise HTTPException(status_code=502, detail="Could not extract image from NVIDIA response")


async def generate_openrouter_flux2max(prompt: str) -> tuple[str, str]:
    """Call OpenRouter Flux.2-max API. Returns (base64_image_data, content_type)."""
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key is not configured on the server.")

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "black-forest-labs/flux.2-max",
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image"],
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code != 200:
        logger.error(f"OpenRouter API error {response.status_code}: {response.text[:500]}")
        raise HTTPException(
            status_code=502, detail=f"OpenRouter API returned status {response.status_code}"
        )

    result = response.json()

    if result.get("choices"):
        message = result["choices"][0].get("message", {})

        # Format 1: images array
        if message.get("images"):
            for image in message["images"]:
                image_url = image.get("image_url", {}).get("url", "")
                if image_url.startswith("data:"):
                    parts = image_url.split(",", 1)
                    ct = parts[0].split(":")[1].split(";")[0] if ":" in parts[0] else "image/png"
                    return parts[1], ct
                elif image_url:
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        img_resp = await client.get(image_url)
                    if img_resp.status_code == 200:
                        ct = img_resp.headers.get("content-type", "image/png")
                        return base64.b64encode(img_resp.content).decode(), ct

        # Format 2: content array with image_url items
        content = message.get("content", "")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "image_url":
                    image_url = item.get("image_url", {}).get("url", "")
                    if image_url.startswith("data:"):
                        parts = image_url.split(",", 1)
                        ct = parts[0].split(":")[1].split(";")[0] if ":" in parts[0] else "image/png"
                        return parts[1], ct

    raise HTTPException(status_code=502, detail="Could not extract image from OpenRouter response")

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/sensitive-words", response_model=SensitiveWordsResponse)
async def get_sensitive_words():
    """Return the list of sensitive/blocked words."""
    return SensitiveWordsResponse(words=SENSITIVE_WORDS)


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_image(req: GenerateRequest):
    """Generate an image using the selected model."""
    if contains_sensitive_words(req.prompt):
        raise HTTPException(
            status_code=400,
            detail="Your prompt contains blocked words. Please try a different prompt.",
        )

    logger.info(f"Generating image | model={req.model} | prompt={req.prompt[:80]}...")

    if req.model == "flux-1-dev":
        img_b64, content_type = await generate_nvidia_flux1dev(
            prompt=req.prompt,
            width=req.width,
            height=req.height,
            steps=req.steps,
            cfg_scale=req.cfg_scale,
            seed=req.seed or 0,
        )
    elif req.model == "flux-2-max":
        img_b64, content_type = await generate_openrouter_flux2max(prompt=req.prompt)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model}")

    return GenerateResponse(
        image_base64=img_b64,
        content_type=content_type,
        model_used=req.model,
    )


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": ENVIRONMENT,
        "nvidia_key_configured": bool(NVIDIA_API_KEY),
        "openrouter_key_configured": bool(OPENROUTER_API_KEY),
    }

# ---------------------------------------------------------------------------
# Static Frontend Serving (Production)
# In production, FastAPI serves the frontend files directly.
# The frontend sits one directory up from the backend folder.
# ---------------------------------------------------------------------------

# Resolve the static directory (parent of backend/)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# Serve index.html at root
@app.get("/")
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "ok", "message": "DevilCreations AI Backend is running"}

# Mount static files AFTER API routes so /api/* is handled first
app.mount("/", StaticFiles(directory=STATIC_DIR, html=False), name="static")
