import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, Float, JSON
from backend.app.core.database import Base


class Job(Base):
    """
    Tracks asynchronous background pipeline executions and progress states.
    """
    __tablename__ = "jobs"

    id = Column(String(64), primary_key=True, index=True)  # UUID or custom job ID
    job_type = Column(String(50), nullable=False, default="pipeline_search")
    status = Column(String(50), default="pending", index=True)  # pending, running, completed, failed, cancelled
    progress = Column(Float, default=0.0)  # 0.0 to 100.0
    current_step = Column(String(255), default="Initialized")
    total_steps = Column(Integer, default=10)
    current_step_index = Column(Integer, default=0)
    
    message = Column(Text, nullable=True)
    error_details = Column(Text, nullable=True)
    params = Column(JSON, nullable=True)
    result_summary = Column(JSON, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
