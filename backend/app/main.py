"""
FastAPI application entry point.
Mounts all routers and configures middleware.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_all_tables
from app.routers import auth, game
from app.routers import ws as ws_router
from app.routers import lobby as lobby_router
from app.services.matchmaking import matchmaking

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    # Create tables on startup (Alembic handles migrations in production)
    await create_all_tables()
    # Start matchmaking background service
    await matchmaking.start()
    print(f"✅ {settings.APP_NAME} v{settings.APP_VERSION} started")
    yield
    await matchmaking.stop()
    print("👋 Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Production-ready chess platform API",
    lifespan=lifespan,
)

# ─── Middleware ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(game.router)
app.include_router(ws_router.router)
app.include_router(lobby_router.router)


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}
