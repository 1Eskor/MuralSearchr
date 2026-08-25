from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend import __version__
from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.core.database import init_db
from backend.app.core.logging import logger

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifespan events.
    """
    logger.info(f"Starting {settings.APP_NAME} v{__version__}...")
    logger.info(f"Environment: {settings.APP_ENV} (Debug: {settings.DEBUG})")
    logger.info(f"Compute Device detected: {settings.detected_device.upper()}")
    logger.info(f"Image Cache Directory: {settings.CACHE_DIR.resolve()}")

    # Initialize database tables
    await init_db()

    yield

    logger.info(f"Shutting down {settings.APP_NAME}...")


def create_app() -> FastAPI:
    """
    FastAPI application factory.
    """
    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        description="Local-first mural prospecting pipeline engine",
        lifespan=lifespan,
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API router
    app.include_router(api_router)

    # Mount static cache directory for direct image preview
    settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/cache-files", StaticFiles(directory=str(settings.CACHE_DIR.resolve())), name="cache_files")

    @app.get("/")
    async def root():
        return {
            "app": settings.APP_NAME,
            "version": __version__,
            "status": "online",
            "docs_url": "/docs",
            "api_prefix": "/api",
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
