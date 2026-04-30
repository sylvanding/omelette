"""API key service — generate, validate, and manage programmatic access keys."""

import hashlib
import secrets
import string
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import API_KEY_SCOPES, APIKey, APIKeyScope

KEY_PREFIX = "omk_"
KEY_LENGTH = 32


def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key.

    Returns:
        Tuple of (raw_key, key_hash, key_prefix).
        raw_key is returned only once at creation time.
    """
    alphabet = string.ascii_letters + string.digits
    raw_key = KEY_PREFIX + "".join(secrets.choice(alphabet) for _ in range(KEY_LENGTH))
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:12]
    return raw_key, key_hash, key_prefix


class APIKeyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_key(self, name: str, scope: str = APIKeyScope.READ) -> tuple[APIKey, str]:
        if scope not in API_KEY_SCOPES:
            raise ValueError(f"Invalid scope: {scope}. Must be one of {API_KEY_SCOPES}")

        raw_key, key_hash, key_prefix = generate_api_key()
        api_key = APIKey(name=name, key_hash=key_hash, key_prefix=key_prefix, scope=scope)
        self.db.add(api_key)
        await self.db.flush()
        await self.db.refresh(api_key)
        return api_key, raw_key

    async def list_keys(self) -> list[APIKey]:
        stmt = select(APIKey).order_by(APIKey.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def revoke_key(self, key_id: int) -> APIKey:
        api_key = await self._get_key(key_id)
        if not api_key.is_active:
            raise ValueError("API key is already revoked")
        api_key.is_active = False
        await self.db.flush()
        await self.db.refresh(api_key)
        return api_key

    async def delete_key(self, key_id: int) -> None:
        api_key = await self._get_key(key_id)
        await self.db.delete(api_key)
        await self.db.flush()

    async def validate_key(self, raw_key: str) -> APIKey | None:
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        stmt = select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active)
        result = await self.db.execute(stmt)
        api_key = result.scalars().first()
        if api_key:
            api_key.last_used_at = datetime.now(UTC)
            await self.db.flush()
        return api_key

    async def touch_key(self, key_id: int) -> None:
        api_key = await self.db.get(APIKey, key_id)
        if api_key:
            api_key.last_used_at = datetime.now(UTC)
            await self.db.flush()

    async def _get_key(self, key_id: int) -> APIKey:
        api_key = await self.db.get(APIKey, key_id)
        if not api_key:
            raise ValueError("API key not found")
        return api_key
