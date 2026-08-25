import datetime
from sqlalchemy import Column, DateTime, Integer, String, Float, Boolean, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class Imagery(Base):
    __tablename__ = "imagery"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    provider = Column(String(50), nullable=False, index=True)  # mapillary, local, google, mock
    external_id = Column(String(255), nullable=True, index=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    heading = Column(Float, nullable=True)  # compass angle 0-360
    pitch = Column(Float, nullable=True)
    capture_date = Column(DateTime, nullable=True)
    source_url = Column(String(1024), nullable=True)
    local_path = Column(String(1024), nullable=True)
    file_hash = Column(String(64), nullable=True, index=True)  # SHA-256
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    is_cached = Column(Boolean, default=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    views = relationship("CandidateView", back_populates="imagery", cascade="all, delete-orphan")
