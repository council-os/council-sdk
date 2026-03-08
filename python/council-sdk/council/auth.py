"""Authentication utilities for the Council SDK."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Credentials:
    """Resolved authentication credentials."""

    api_key: Optional[str] = None
    jwt_token: Optional[str] = None
    base_url: str = "http://localhost:3001"
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    extra_headers: dict[str, str] = field(default_factory=dict)

    @property
    def auth_header(self) -> dict[str, str]:
        """Return the Authorization header dict."""
        if self.access_token:
            return {"Authorization": f"Bearer {self.access_token}"}
        if self.jwt_token:
            return {"Authorization": f"Bearer {self.jwt_token}"}
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    @property
    def headers(self) -> dict[str, str]:
        """Return all headers including auth and extras."""
        h: dict[str, str] = {
            "Content-Type": "application/json",
            "User-Agent": "council-sdk-python/1.0.0",
        }
        h.update(self.auth_header)
        h.update(self.extra_headers)
        return h


def resolve_credentials(
    *,
    api_key: Optional[str] = None,
    jwt_token: Optional[str] = None,
    base_url: Optional[str] = None,
    profile: str = "default",
) -> Credentials:
    """Resolve credentials following the priority chain:
    1. Explicit parameters (highest)
    2. Environment variables
    3. Config file (~/.council/config.json)
    """
    # 1. Start with explicit values
    resolved_key = api_key
    resolved_jwt = jwt_token
    resolved_url = base_url

    # 2. Fill gaps from environment
    if not resolved_key:
        resolved_key = os.environ.get("COUNCIL_API_KEY")
    if not resolved_jwt:
        resolved_jwt = os.environ.get("COUNCIL_JWT_TOKEN")
    if not resolved_url:
        resolved_url = os.environ.get("COUNCIL_BASE_URL")

    # 3. Fill remaining gaps from config file
    config = _load_config(profile)
    if config:
        if not resolved_key:
            resolved_key = config.get("api_key")
        if not resolved_url:
            resolved_url = config.get("base_url")

    return Credentials(
        api_key=resolved_key,
        jwt_token=resolved_jwt,
        base_url=resolved_url or "http://localhost:3001",
    )


def _load_config(profile: str = "default") -> Optional[dict[str, str]]:
    """Load credentials from ~/.council/config.json."""
    config_path = Path.home() / ".council" / "config.json"
    if not config_path.exists():
        return None
    try:
        with open(config_path) as f:
            data = json.load(f)
        return data.get(profile, data.get("default"))
    except (json.JSONDecodeError, OSError):
        return None
