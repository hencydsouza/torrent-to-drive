from .torrents import router as torrents_router
from .storage import router as storage_router
from .settings import router as settings_router
from .auth import router as auth_router

__all__ = ["torrents_router", "storage_router", "settings_router", "auth_router"]
