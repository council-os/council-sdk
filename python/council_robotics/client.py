"""
Council Robotics Client

Main client for connecting robots to the Council platform.
Handles authentication, WebSocket connection, and message routing.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime

import aiohttp
import websockets
from websockets.client import WebSocketClientProtocol

logger = logging.getLogger(__name__)


@dataclass
class CouncilConfig:
    """Configuration for Council connection."""

    base_url: str = "http://localhost:4000"
    ws_url: str = "ws://localhost:4000/robotics"
    api_key: Optional[str] = None
    robot_id: Optional[str] = None
    auth_token: Optional[str] = None
    reconnect_attempts: int = 5
    reconnect_delay: float = 2.0
    heartbeat_interval: float = 30.0


@dataclass
class ConnectionState:
    """Current connection state."""

    connected: bool = False
    authenticated: bool = False
    session_id: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    connection_id: Optional[str] = None


class CouncilRoboticsClient:
    """
    Main client for connecting robots to Council platform.

    Usage:
        client = CouncilRoboticsClient(
            base_url="https://council.example.com",
            api_key="your-api-key",
            robot_id="robot-001"
        )
        await client.connect()
        await client.send_telemetry(telemetry_data)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:4000",
        ws_url: Optional[str] = None,
        api_key: Optional[str] = None,
        robot_id: Optional[str] = None,
        auth_token: Optional[str] = None,
    ):
        self.config = CouncilConfig(
            base_url=base_url,
            ws_url=ws_url or base_url.replace("http", "ws") + "/robotics",
            api_key=api_key,
            robot_id=robot_id,
            auth_token=auth_token,
        )
        self.state = ConnectionState()
        self._ws: Optional[WebSocketClientProtocol] = None
        self._http_session: Optional[aiohttp.ClientSession] = None
        self._message_handlers: Dict[str, List[Callable]] = {}
        self._tasks: List[asyncio.Task] = []
        self._running = False

        # Register default handlers
        self._register_default_handlers()

    def _register_default_handlers(self):
        """Register default message handlers."""
        self.on_message("connected", self._handle_connected)
        self.on_message("auth_success", self._handle_auth_success)
        self.on_message("auth_error", self._handle_auth_error)
        self.on_message("command", self._handle_command)
        self.on_message("pause", self._handle_pause)
        self.on_message("resume", self._handle_resume)
        self.on_message("abort", self._handle_abort)

    async def connect(self) -> bool:
        """
        Connect to Council platform.

        Returns:
            True if connection successful
        """
        try:
            # Create HTTP session for REST API calls
            self._http_session = aiohttp.ClientSession(
                headers=self._get_headers()
            )

            # Connect WebSocket
            self._ws = await websockets.connect(
                self.config.ws_url,
                extra_headers=self._get_headers(),
            )

            self.state.connected = True
            self._running = True

            # Start background tasks
            self._tasks.append(asyncio.create_task(self._message_loop()))
            self._tasks.append(asyncio.create_task(self._heartbeat_loop()))

            # Wait for connection acknowledgment
            await asyncio.sleep(0.5)

            # Authenticate
            await self._authenticate()

            logger.info("Connected to Council platform")
            return True

        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False

    async def disconnect(self):
        """Disconnect from Council platform."""
        self._running = False

        # Cancel background tasks
        for task in self._tasks:
            task.cancel()

        if self._ws:
            await self._ws.close()
            self._ws = None

        if self._http_session:
            await self._http_session.close()
            self._http_session = None

        self.state.connected = False
        self.state.authenticated = False
        logger.info("Disconnected from Council platform")

    async def _authenticate(self):
        """Send authentication message."""
        auth_msg = {
            "type": "auth",
            "token": self.config.auth_token or self.config.api_key,
            "robotId": self.config.robot_id,
        }
        await self._send(auth_msg)

    async def _message_loop(self):
        """Background loop to receive messages."""
        while self._running and self._ws:
            try:
                message = await self._ws.recv()
                data = json.loads(message)
                await self._dispatch_message(data)
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket connection closed")
                await self._handle_reconnect()
            except Exception as e:
                logger.error(f"Message loop error: {e}")

    async def _heartbeat_loop(self):
        """Send periodic heartbeats."""
        while self._running:
            await asyncio.sleep(self.config.heartbeat_interval)
            if self._ws and self.state.authenticated:
                await self._send({"type": "heartbeat", "timestamp": datetime.now().isoformat()})
                self.state.last_heartbeat = datetime.now()

    async def _handle_reconnect(self):
        """Handle reconnection with exponential backoff."""
        for attempt in range(self.config.reconnect_attempts):
            delay = self.config.reconnect_delay * (2 ** attempt)
            logger.info(f"Reconnecting in {delay}s (attempt {attempt + 1})")
            await asyncio.sleep(delay)

            try:
                self._ws = await websockets.connect(
                    self.config.ws_url,
                    extra_headers=self._get_headers(),
                )
                await self._authenticate()
                logger.info("Reconnected successfully")
                return
            except Exception as e:
                logger.error(f"Reconnection failed: {e}")

        logger.error("Max reconnection attempts reached")
        self._running = False

    async def _dispatch_message(self, data: Dict[str, Any]):
        """Dispatch message to registered handlers."""
        msg_type = data.get("type", "unknown")
        handlers = self._message_handlers.get(msg_type, [])

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(data)
                else:
                    handler(data)
            except Exception as e:
                logger.error(f"Handler error for {msg_type}: {e}")

    async def _send(self, data: Dict[str, Any]):
        """Send message through WebSocket."""
        if self._ws:
            await self._ws.send(json.dumps(data))

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers for requests."""
        headers = {"Content-Type": "application/json"}
        if self.config.auth_token:
            headers["Authorization"] = f"Bearer {self.config.auth_token}"
        elif self.config.api_key:
            headers["X-API-Key"] = self.config.api_key
        return headers

    # =========================================================================
    # Message Handlers
    # =========================================================================

    def on_message(self, msg_type: str, handler: Callable):
        """Register a message handler."""
        if msg_type not in self._message_handlers:
            self._message_handlers[msg_type] = []
        self._message_handlers[msg_type].append(handler)

    async def _handle_connected(self, data: Dict[str, Any]):
        """Handle connection acknowledgment."""
        self.state.connection_id = data.get("connectionId")
        logger.info(f"Connection acknowledged: {self.state.connection_id}")

    async def _handle_auth_success(self, data: Dict[str, Any]):
        """Handle successful authentication."""
        self.state.authenticated = True
        logger.info(f"Authentication successful for robot: {data.get('robotId')}")

    async def _handle_auth_error(self, data: Dict[str, Any]):
        """Handle authentication error."""
        logger.error(f"Authentication failed: {data.get('error')}")
        await self.disconnect()

    async def _handle_command(self, data: Dict[str, Any]):
        """Handle incoming command from Council."""
        command = data.get("command", {})
        logger.info(f"Received command: {command.get('type')}")
        # Override in subclass or register custom handler

    async def _handle_pause(self, data: Dict[str, Any]):
        """Handle pause command."""
        logger.info("Execution paused by operator")

    async def _handle_resume(self, data: Dict[str, Any]):
        """Handle resume command."""
        logger.info("Execution resumed by operator")

    async def _handle_abort(self, data: Dict[str, Any]):
        """Handle abort command."""
        logger.warning("Execution aborted by operator")

    # =========================================================================
    # Public API
    # =========================================================================

    async def send_telemetry(
        self,
        joint_positions: Optional[List[float]] = None,
        joint_velocities: Optional[List[float]] = None,
        end_effector_pose: Optional[Dict[str, float]] = None,
        force_torque: Optional[List[float]] = None,
        battery_level: Optional[float] = None,
        errors: Optional[List[str]] = None,
    ):
        """
        Send robot telemetry to Council.

        Args:
            joint_positions: Current joint angles (radians)
            joint_velocities: Current joint velocities
            end_effector_pose: End effector pose {x, y, z, qx, qy, qz, qw}
            force_torque: Force/torque sensor readings
            battery_level: Battery percentage (0-100)
            errors: List of current error messages
        """
        telemetry = {
            "type": "telemetry",
            "data": {
                "timestamp": datetime.now().timestamp() * 1000,
            }
        }

        if joint_positions:
            telemetry["data"]["jointPositions"] = joint_positions
        if joint_velocities:
            telemetry["data"]["jointVelocities"] = joint_velocities
        if end_effector_pose:
            telemetry["data"]["endEffectorPose"] = end_effector_pose
        if force_torque:
            telemetry["data"]["forceTorque"] = force_torque
        if battery_level is not None:
            telemetry["data"]["batteryLevel"] = battery_level
        if errors:
            telemetry["data"]["errors"] = errors

        await self._send(telemetry)

    async def send_camera_frame(self, frame_base64: str):
        """
        Send camera frame to Council for vision processing.

        Args:
            frame_base64: Base64 encoded image
        """
        await self._send({
            "type": "camera_frame",
            "frame": frame_base64,
            "timestamp": datetime.now().timestamp() * 1000,
        })

    async def report_command_result(
        self,
        command_id: str,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
    ):
        """
        Report command execution result.

        Args:
            command_id: ID of the executed command
            success: Whether command succeeded
            result: Optional result data
        """
        await self._send({
            "type": "command_result",
            "commandId": command_id,
            "success": success,
            "result": result,
        })

    async def join_session(self, session_id: str):
        """
        Join a physical lab session.

        Args:
            session_id: Session to join
        """
        self.state.session_id = session_id
        await self._send({
            "type": "join_session",
            "sessionId": session_id,
        })

    # =========================================================================
    # REST API Methods
    # =========================================================================

    async def register_robot(
        self,
        name: str,
        robot_type: str,
        manufacturer: str,
        model: str,
        capabilities: List[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Register robot with Council platform.

        Args:
            name: Robot display name
            robot_type: Type (manipulator, mobile, drone, etc.)
            manufacturer: Robot manufacturer
            model: Robot model
            capabilities: List of capabilities
            metadata: Additional metadata

        Returns:
            Robot registration data
        """
        if not self._http_session:
            raise RuntimeError("Client not connected")

        async with self._http_session.post(
            f"{self.config.base_url}/api/robotics/robots",
            json={
                "name": name,
                "robotType": robot_type,
                "manufacturer": manufacturer,
                "model": model,
                "capabilities": capabilities,
                "metadata": metadata or {},
            }
        ) as resp:
            if resp.status == 201:
                data = await resp.json()
                self.config.robot_id = data.get("robotId")
                return data
            else:
                error = await resp.text()
                logger.error(f"Robot registration failed: {error}")
                return None

    async def get_robot(self, robot_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get robot details."""
        robot_id = robot_id or self.config.robot_id
        if not robot_id or not self._http_session:
            return None

        async with self._http_session.get(
            f"{self.config.base_url}/api/robotics/robots/{robot_id}"
        ) as resp:
            if resp.status == 200:
                return await resp.json()
            return None

    async def create_wallet(self, robot_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Create robot wallet for economic transactions."""
        robot_id = robot_id or self.config.robot_id
        if not robot_id or not self._http_session:
            return None

        async with self._http_session.post(
            f"{self.config.base_url}/api/robotics/robots/{robot_id}/wallet"
        ) as resp:
            if resp.status == 201:
                return await resp.json()
            return None

    async def analyze_scene(
        self,
        image_base64: str,
        task_context: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze scene using Council's vision agent.

        Args:
            image_base64: Base64 encoded image
            task_context: Optional context about current task

        Returns:
            Scene analysis with objects, poses, etc.
        """
        if not self._http_session:
            return None

        async with self._http_session.post(
            f"{self.config.base_url}/api/robotics/vision/analyze",
            json={
                "imageBase64": image_base64,
                "taskContext": task_context,
            }
        ) as resp:
            if resp.status == 200:
                return await resp.json()
            return None

    async def generate_plan(
        self,
        goal: str,
        scene_analysis: Optional[Dict[str, Any]] = None,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Generate execution plan using Council's planner agent.

        Args:
            goal: Task goal description
            scene_analysis: Optional scene analysis from vision
            constraints: Optional constraints (speed limits, forbidden zones, etc.)

        Returns:
            Execution plan with steps
        """
        if not self._http_session:
            return None

        robot_id = self.config.robot_id

        async with self._http_session.post(
            f"{self.config.base_url}/api/robotics/planner/generate",
            json={
                "robotId": robot_id,
                "goal": goal,
                "sceneAnalysis": scene_analysis,
                "constraints": constraints,
            }
        ) as resp:
            if resp.status == 200:
                return await resp.json()
            return None


# Convenience function
async def create_client(
    base_url: str = "http://localhost:4000",
    api_key: Optional[str] = None,
    robot_id: Optional[str] = None,
) -> CouncilRoboticsClient:
    """
    Create and connect a Council robotics client.

    Args:
        base_url: Council server URL
        api_key: API key for authentication
        robot_id: Robot ID

    Returns:
        Connected CouncilRoboticsClient
    """
    client = CouncilRoboticsClient(
        base_url=base_url,
        api_key=api_key,
        robot_id=robot_id,
    )
    await client.connect()
    return client
