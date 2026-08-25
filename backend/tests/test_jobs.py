import asyncio
import pytest
from backend.app.services.job_runner import JobManager


@pytest.mark.asyncio
async def test_job_manager_lifecycle():
    manager = JobManager()

    job_id = manager.create_job(job_type="test_task", total_steps=3)
    job = manager.get_job(job_id)
    assert job is not None
    assert job["status"] == "pending"

    await manager.update_job(job_id, status="running", step_index=1, step_name="Step 1", message="Running step 1")
    job = manager.get_job(job_id)
    assert job["status"] == "running"
    assert job["progress"] > 0
    assert len(job["logs"]) == 1

    await manager.update_job(job_id, status="completed", progress=100.0, step_name="Done", message="Finished")
    job = manager.get_job(job_id)
    assert job["status"] == "completed"
    assert job["progress"] == 100.0
    assert job["completed_at"] is not None


@pytest.mark.asyncio
async def test_job_background_execution():
    manager = JobManager()
    job_id = manager.create_job(job_type="async_work", total_steps=2)

    async def sample_work(jid: str):
        await asyncio.sleep(0.05)
        await manager.update_job(jid, step_index=1, message="Halfway")
        return {"items_processed": 42}

    task = manager.start_background_task(job_id, sample_work)
    await task

    job = manager.get_job(job_id)
    assert job["status"] == "completed"
    assert job["result_summary"] == {"items_processed": 42}
