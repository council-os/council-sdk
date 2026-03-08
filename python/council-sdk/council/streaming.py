"""WebSocket streaming for real-time Council events."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Optional

from council.auth import Credentials
from council.types import StreamEvent


class EventStream:
    """WebSocket event stream for real-time updates.

    Usage::

        async with client.stream() as stream:
            await stream.subscribe("agent:agent_abc123")
            await stream.subscribe("jury:*")

            async for event in stream:
                print(f"{event.type}: {event.data}")
    """

    def __init__(self, credentials: Credentials) -> None:
        self._credentials = credentials
        self._ws: Any = None
        self._subscriptions: list[str] = []
        self._closed = False

    async def connect(self) -> None:
        """Establish the WebSocket connection."""
        try:
            import websockets
        except ImportError:
            raise ImportError(
                "websockets is required for streaming. "
                "Install it with: pip install council-sdk"
            )

        base = self._credentials.base_url.replace("http://", "ws://").replace(
            "https://", "wss://"
        )
        url = f"{base}/events"

        headers = self._credentials.auth_header
        self._ws = await websockets.connect(url, additional_headers=headers)

    async def subscribe(self, channel: str) -> None:
        """Subscribe to a channel (e.g., 'agent:agent_abc123', 'jury:*')."""
        self._subscriptions.append(channel)
        if self._ws:
            await self._ws.send(
                json.dumps({"type": "subscribe", "channel": channel})
            )

    async def unsubscribe(self, channel: str) -> None:
        """Unsubscribe from a channel."""
        self._subscriptions = [s for s in self._subscriptions if s != channel]
        if self._ws:
            await self._ws.send(
                json.dumps({"type": "unsubscribe", "channel": channel})
            )

    async def close(self) -> None:
        """Close the WebSocket connection."""
        self._closed = True
        if self._ws:
            await self._ws.close()
            self._ws = None

    def __aiter__(self) -> AsyncIterator[StreamEvent]:
        return self._iter_events()

    async def _iter_events(self) -> AsyncIterator[StreamEvent]:
        """Iterate over incoming events."""
        if not self._ws:
            await self.connect()

        assert self._ws is not None

        # Re-subscribe after connect
        for channel in self._subscriptions:
            await self._ws.send(
                json.dumps({"type": "subscribe", "channel": channel})
            )

        try:
            async for message in self._ws:
                if self._closed:
                    break

                try:
                    data = json.loads(message) if isinstance(message, str) else json.loads(message)
                except json.JSONDecodeError:
                    continue

                # Skip internal messages
                msg_type = data.get("type", "")
                if msg_type in ("subscribe_ack", "unsubscribe_ack", "ping", "pong"):
                    continue

                yield StreamEvent(
                    type=msg_type,
                    data=data.get("data", data),
                    timestamp=data.get("timestamp"),
                )
        except Exception:
            if not self._closed:
                raise

    async def __aenter__(self) -> "EventStream":
        await self.connect()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
