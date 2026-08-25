import pytest_asyncio
from backend.app.core.database import init_db


@pytest_asyncio.fixture(autouse=True, scope="session")
async def setup_test_database():
    """
    Ensure all SQLAlchemy database tables are initialized before running test suite.
    """
    await init_db()
