import datetime
from sqlalchemy import Column, DateTime, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class AnalysisRun(Base):
    """
    Audit log of an entire analysis run across a search polygon.
    """
    __tablename__ = "analysis_runs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    search_area_id = Column(Integer, ForeignKey("search_areas.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="completed")  # running, completed, failed
    
    geodata_provider = Column(String(50), default="osm")
    imagery_provider = Column(String(50), default="mapillary")
    vision_ranker = Column(String(50), default="openclip")
    vision_analyzer = Column(String(50), default="local_vlm")
    
    total_sample_points = Column(Integer, default=0)
    total_images_queried = Column(Integer, default=0)
    total_images_ranked = Column(Integer, default=0)
    total_candidates_found = Column(Integer, default=0)
    
    duration_seconds = Column(Float, default=0.0)
    config_snapshot = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    search_area = relationship("SearchArea", back_populates="analysis_runs")
