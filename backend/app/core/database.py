from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from backend.app.core.config import get_settings
from backend.app.core.logging import logger

settings = get_settings()

# Engine creation with sqlite-specific configuration if applicable
connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args["check_same_thread"] = False

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    future=True,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize all database tables and synchronize new columns.
    """
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Check and migrate candidate_views table schema if needed
        def _migrate_candidate_views(sync_conn):
            try:
                res = sync_conn.execute(text("PRAGMA table_info(candidate_views)")).fetchall()
                cand_id_col = next((r for r in res if r[1] == 'candidate_id'), None)
                if cand_id_col and cand_id_col[3] == 1:
                    logger.info("Migrating candidate_views schema to support nullable candidate_id...")
                    sync_conn.execute(text("DROP TABLE IF EXISTS candidate_views"))
                    Base.metadata.tables["candidate_views"].create(sync_conn)
                    return

                existing_cols = {row[1] for row in res}
                new_columns = [
                    ("view_heading", "FLOAT"),
                    ("pitch", "FLOAT DEFAULT 0.0"),
                    ("fov_degrees", "FLOAT DEFAULT 90.0"),
                    ("crop_box_json", "JSON"),
                    ("file_hash", "VARCHAR(64)"),
                    ("local_path", "VARCHAR(500)"),
                    ("width", "INTEGER DEFAULT 512"),
                    ("height", "INTEGER DEFAULT 512"),
                    ("is_sliced_from_pano", "BOOLEAN DEFAULT 0"),
                ]
                for col_name, col_type in new_columns:
                    if col_name not in existing_cols:
                        sync_conn.execute(text(f"ALTER TABLE candidate_views ADD COLUMN {col_name} {col_type}"))
                # Check candidates table columns
                cand_res = sync_conn.execute(text("PRAGMA table_info(candidates)")).fetchall()
                cand_cols = {row[1] for row in cand_res}
                for c_name, c_type in [("primary_view_id", "INTEGER"), ("address", "VARCHAR(255)"), ("openai_verification_json", "JSON")]:
                    if c_name not in cand_cols:
                        sync_conn.execute(text(f"ALTER TABLE candidates ADD COLUMN {c_name} {c_type}"))
                        logger.info(f"Added column '{c_name}' to candidates table")
            except Exception as e:
                logger.warning(f"Column migration check notice: {e}")

        from sqlalchemy import text
        await conn.run_sync(_migrate_candidate_views)

    logger.info("Database tables initialized and synchronized successfully.")
