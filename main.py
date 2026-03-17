import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers.chat import router as chat_router
from routers.conversations import router as conversations_router

load_dotenv()  # Load .env into os.environ before anything reads env vars

app = FastAPI(title="Nexus")

# --- CORS ---
# Read allowed origins from env (comma-separated), fall back to localhost for dev
_origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _origins_raw.split(",")]  # Split on comma to support multiple origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# --- Routers ---
app.include_router(chat_router)
app.include_router(conversations_router)


# --- Health check (required by Railway) ---
@app.get("/health")
async def health():
    return {"status": "ok"}
