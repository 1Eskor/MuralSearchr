import asyncio
import datetime
import json
import uuid
from typing import Any, AsyncGenerator, Callable, Coroutine, Dict, List, Optional
from pydantic import BaseModel
from backend.app.core.logging import logger


class JobUpdate(BaseModel):
    job_id: str
    job_type: str
    status: str  # pending, running, completed, failed, cancelled
    progress: float  # 0.0 to 100.0
    current_step: str
    total_steps: int
    current_step_index: int
    message: Optional[str] = None
    error_details: Optional[str] = None
    result_summary: Optional[Dict[str, Any]] = None
    updated_at: str


class JobManager:
    """
    Asynchronous background job manager with step tracking, progress calculations,
    and real-time Server-Sent Events (SSE) broadcasting.
    """

    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._global_subscribers: List[asyncio.Queue] = []

    def create_job(
        self,
        job_type: str,
        total_steps: int = 5,
        params: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None,
    ) -> str:
        jid = job_id or f"job_{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.utcnow().isoformat()

        job_data = {
            "job_id": jid,
            "job_type": job_type,
            "status": "pending",
            "progress": 0.0,
            "current_step": "Initialized",
            "total_steps": total_steps,
            "current_step_index": 0,
            "message": "Job queued and awaiting execution",
            "error_details": None,
            "params": params or {},
            "result_summary": None,
            "started_at": None,
            "completed_at": None,
            "created_at": now,
            "updated_at": now,
            "logs": [],
        }

        self._jobs[jid] = job_data
        self._subscribers[jid] = []
        logger.info(f"Created background job [{jid}] (type: {job_type})")
        return jid

    async def update_job(
        self,
        job_id: str,
        status: Optional[str] = None,
        step_index: Optional[int] = None,
        step_name: Optional[str] = None,
        message: Optional[str] = None,
        progress: Optional[float] = None,
        result_summary: Optional[Dict[str, Any]] = None,
        error_details: Optional[str] = None,
    ) -> None:
        if job_id not in self._jobs:
            return

        job = self._jobs[job_id]
        now = datetime.datetime.utcnow().isoformat()
        job["updated_at"] = now

        if status:
            job["status"] = status
            if status == "running" and not job["started_at"]:
                job["started_at"] = now
            elif status in ("completed", "failed", "cancelled"):
                job["completed_at"] = now

        if step_name:
            job["current_step"] = step_name
        if step_index is not None:
            job["current_step_index"] = step_index
            if progress is None and job["total_steps"] > 0:
                job["progress"] = min(100.0, round((step_index / job["total_steps"]) * 100.0, 1))

        if progress is not None:
            job["progress"] = round(progress, 1)

        if message:
            job["message"] = message
            job["logs"].append({"timestamp": now, "message": message, "step": job["current_step"]})

        if result_summary is not None:
            job["result_summary"] = result_summary
        if error_details:
            job["error_details"] = error_details

        # Broadcast update to subscribers
        await self._broadcast(job_id)

    async def _broadcast(self, job_id: str) -> None:
        if job_id not in self._jobs:
            return

        job = self._jobs[job_id]
        payload = json.dumps(job)

        # Broadcast to specific job subscribers
        if job_id in self._subscribers:
            for q in list(self._subscribers[job_id]):
                try:
                    await q.put(payload)
                except Exception:
                    pass

        # Broadcast to global subscribers
        for q in list(self._global_subscribers):
            try:
                await q.put(payload)
            except Exception:
                pass

    def start_background_task(
        self,
        job_id: str,
        coro_fn: Callable[..., Coroutine[Any, Any, Any]],
        *args,
        **kwargs,
    ) -> asyncio.Task:
        """
        Launch an asynchronous background worker task and wrap error handling.
        """
        async def _wrapper():
            try:
                await self.update_job(job_id, status="running", message="Task started")
                result = await coro_fn(job_id, *args, **kwargs)
                await self.update_job(
                    job_id,
                    status="completed",
                    progress=100.0,
                    step_name="Done",
                    message="Task completed successfully",
                    result_summary=result if isinstance(result, dict) else {"result": "success"},
                )
            except asyncio.CancelledError:
                logger.warning(f"Job [{job_id}] was cancelled")
                await self.update_job(job_id, status="cancelled", message="Task was cancelled by user")
            except Exception as e:
                logger.exception(f"Job [{job_id}] encountered an unhandled exception: {e}")
                await self.update_job(
                    job_id,
                    status="failed",
                    message=f"Error: {str(e)}",
                    error_details=str(e),
                )
            finally:
                if job_id in self._tasks:
                    del self._tasks[job_id]

        task = asyncio.create_task(_wrapper())
        self._tasks[job_id] = task
        return task

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._jobs.get(job_id)

    def list_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        jobs = list(self._jobs.values())
        jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
        return jobs[:limit]

    def cancel_job(self, job_id: str) -> bool:
        if job_id in self._tasks:
            self._tasks[job_id].cancel()
            return True
        return False

    async def subscribe_job(self, job_id: str) -> AsyncGenerator[str, None]:
        """Subscribe to real-time events for a specific job."""
        queue: asyncio.Queue = asyncio.Queue()
        if job_id not in self._subscribers:
            self._subscribers[job_id] = []
        self._subscribers[job_id].append(queue)

        # Send initial state immediately
        if job_id in self._jobs:
            yield json.dumps(self._jobs[job_id])

        try:
            while True:
                data = await queue.get()
                yield data
        except asyncio.CancelledError:
            pass
        finally:
            if job_id in self._subscribers and queue in self._subscribers[job_id]:
                self._subscribers[job_id].remove(queue)

    async def subscribe_global(self) -> AsyncGenerator[str, None]:
        """Subscribe to all job event streams."""
        queue: asyncio.Queue = asyncio.Queue()
        self._global_subscribers.append(queue)

        try:
            while True:
                data = await queue.get()
                yield data
        except asyncio.CancelledError:
            pass
        finally:
            if queue in self._global_subscribers:
                self._global_subscribers.remove(queue)


# Global job manager instance
job_manager = JobManager()
