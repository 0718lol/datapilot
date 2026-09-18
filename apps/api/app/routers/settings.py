from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..config import settings
from ..models import User

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/model")
def model_settings(user: User = Depends(get_current_user)):
    return {
        "provider": settings.model_provider,
        "base_url": settings.openai_base_url if settings.model_provider == "openai" else None,
        "model": settings.model_name if settings.model_provider == "openai" else "内置演示模型",
        "key_configured": bool(settings.openai_api_key) if settings.model_provider == "openai" else True,
    }
