import datetime
from sqlalchemy import Column, DateTime, Integer, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class Score(Base):
    """
    Historical record of scored candidate evaluations and weight versions.
    """
    __tablename__ = "scores"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    scoring_version = Column(Integer, default=1)
    
    wall_score = Column(Float, nullable=False)
    blankness_score = Column(Float, nullable=False)
    visibility_score = Column(Float, nullable=False)
    access_score = Column(Float, nullable=False)
    confidence_score = Column(Float, nullable=False)
    composite_score = Column(Float, nullable=False)

    weights_json = Column(JSON, nullable=False)
    breakdown_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    candidate = relationship("Candidate", back_populates="scores")
