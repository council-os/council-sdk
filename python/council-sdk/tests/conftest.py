"""Pytest configuration."""

import pytest


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Ensure no Council env vars leak between tests."""
    monkeypatch.delenv("COUNCIL_API_KEY", raising=False)
    monkeypatch.delenv("COUNCIL_BASE_URL", raising=False)
    monkeypatch.delenv("COUNCIL_JWT_TOKEN", raising=False)
