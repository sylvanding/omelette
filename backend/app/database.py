"""Database engine and session management."""

from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _get_async_url(url: str) -> str:
    """Convert sync SQLAlchemy URL to async variant."""
    if url.startswith("sqlite:///"):
        db_path = url.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db_path}"
    return url


engine = create_async_engine(
    _get_async_url(settings.database_url),
    echo=settings.app_debug,
    future=True,
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    """Enable WAL mode and foreign keys for SQLite."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Run Alembic migrations to bring the database schema up to date.

    Handles pre-migration databases by stamping the initial revision
    when tables exist but alembic_version is empty.
    """
    import logging
    import subprocess
    import sys

    logger = logging.getLogger("omelette")
    backend_dir = Path(__file__).resolve().parent.parent

    if settings.database_url.startswith("sqlite:///"):
        _stamp_existing_db_if_needed(settings.database_url, backend_dir, logger)

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic migration failed:\n{result.stderr}")


def _stamp_existing_db_if_needed(database_url: str, backend_dir: Path, logger) -> None:
    """Stamp a pre-migration database so Alembic knows its current state.

    If the database has tables but an empty alembic_version, it was created
    before Alembic was introduced. We stamp it with the initial revision
    so subsequent `upgrade head` only applies incremental migrations.
    """
    import sqlite3
    import subprocess
    import sys

    db_path = database_url.replace("sqlite:///", "")
    if not Path(db_path).exists():
        return

    try:
        conn = sqlite3.connect(db_path)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}

        if "alembic_version" not in tables:
            conn.close()
            return

        versions = conn.execute("SELECT version_num FROM alembic_version").fetchall()
        conn.close()

        if versions:
            return

        if "projects" in tables:
            logger.info("Pre-migration database detected — stamping initial revision")
            result = subprocess.run(
                [sys.executable, "-m", "alembic", "stamp", "082111bd1d99"],
                cwd=str(backend_dir),
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.warning("Alembic stamp failed: %s", result.stderr)
    except Exception as e:
        logger.warning("Pre-migration check failed: %s", e)
