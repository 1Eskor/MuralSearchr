from typing import Any, Dict, Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None
    error: Optional[str] = None
