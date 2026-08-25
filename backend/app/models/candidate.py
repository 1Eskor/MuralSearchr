import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, Float, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class Candidate(Base):
    """
    Represents a clustered/deduplicated mural wall candidate location.
    """
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    search_area_id = Column(Integer, ForeignKey("search_areas.id", ondelete="SET NULL"), nullable=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    address = Column(String(255), nullable=True)
    best_image_id = Column(Integer, ForeignKey("imagery.id", ondelete="SET NULL"), nullable=True)
    primary_view_id = Column(Integer, ForeignKey("candidate_views.id", ondelete="SET NULL"), nullable=True)
    view_count = Column(Integer, default=1)
    
    # Core component scores (0-100)
    wall_score = Column(Float, default=0.0)
    blankness_score = Column(Float, default=0.0)
    visibility_score = Column(Float, default=0.0)
    access_score = Column(Float, default=0.0)
    confidence_score = Column(Float, default=0.0)
    overall_score = Column(Float, default=0.0, index=True)

    # Wall properties
    estimated_size = Column(String(50), default="medium")  # small, medium, large, very_large
    wall_material = Column(String(100), nullable=True)     # brick, concrete, stucco, metal
    existing_artwork = Column(Boolean, default=False)
    verified_by_openai = Column(Boolean, default=False)
    
    # Detailed analysis summary
    analysis_json = Column(JSON, nullable=True)
    openai_verification_json = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    search_area = relationship("SearchArea", back_populates="candidates")
    views = relationship("CandidateView", back_populates="candidate", cascade="all, delete-orphan", foreign_keys="[CandidateView.candidate_id]")
    scores = relationship("Score", back_populates="candidate", cascade="all, delete-orphan")


class CandidateView(Base):
    """
    Directional perspective slice or standardized camera view of street imagery.
    Associates directional views with imagery and future clustered Wall Candidates.
    """
    __tablename__ = "candidate_views"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    imagery_id = Column(Integer, ForeignKey("imagery.id", ondelete="CASCADE"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True)
    view_heading = Column(Float, nullable=True)  # Compass direction of view (0-360)
    pitch = Column(Float, default=0.0)
    fov_degrees = Column(Float, default=90.0)
    crop_box_json = Column(JSON, nullable=True)
    file_hash = Column(String(64), nullable=True, index=True)
    local_path = Column(String(500), nullable=True)
    width = Column(Integer, default=512)
    height = Column(Integer, default=512)
    is_sliced_from_pano = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    wall_detected = Column(Boolean, default=True)
    raw_clip_score = Column(Float, default=0.0)
    analysis_summary = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    candidate = relationship("Candidate", back_populates="views", foreign_keys=[candidate_id])
    imagery = relationship("Imagery", back_populates="views")
