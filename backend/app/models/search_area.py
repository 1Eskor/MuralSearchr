import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, Float, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class SearchArea(Base):
    __tablename__ = "search_areas"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False, default="Unnamed Area")
    polygon_geojson = Column(JSON, nullable=False)
    status = Column(String(50), default="ready")
    total_roads = Column(Integer, default=0)
    total_buildings = Column(Integer, default=0)
    sample_points_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    candidates = relationship("Candidate", back_populates="search_area", cascade="all, delete-orphan")
    analysis_runs = relationship("AnalysisRun", back_populates="search_area", cascade="all, delete-orphan")
