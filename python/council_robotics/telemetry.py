"""
Telemetry Streaming

Real-time telemetry collection and streaming for robots.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class JointState:
    """Joint state for articulated robots."""

    names: List[str]
    positions: List[float]  # radians
    velocities: List[float] = field(default_factory=list)  # rad/s
    efforts: List[float] = field(default_factory=list)  # Nm
    timestamp: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "names": self.names,
            "positions": self.positions,
            "velocities": self.velocities,
            "efforts": self.efforts,
            "timestamp": self.timestamp,
        }


@dataclass
class Pose:
    """6DoF pose (position + orientation)."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    qx: float = 0.0
    qy: float = 0.0
    qz: float = 0.0
    qw: float = 1.0
    frame_id: str = "world"

    def to_dict(self) -> Dict[str, float]:
        return {
            "x": self.x,
            "y": self.y,
            "z": self.z,
            "qx": self.qx,
            "qy": self.qy,
            "qz": self.qz,
            "qw": self.qw,
        }

    @classmethod
    def from_position_euler(
        cls,
        x: float,
        y: float,
        z: float,
        roll: float,
        pitch: float,
        yaw: float,
        frame_id: str = "world",
    ) -> "Pose":
        """Create pose from position and Euler angles."""
        import math

        # Convert Euler to quaternion
        cy = math.cos(yaw * 0.5)
        sy = math.sin(yaw * 0.5)
        cp = math.cos(pitch * 0.5)
        sp = math.sin(pitch * 0.5)
        cr = math.cos(roll * 0.5)
        sr = math.sin(roll * 0.5)

        qw = cr * cp * cy + sr * sp * sy
        qx = sr * cp * cy - cr * sp * sy
        qy = cr * sp * cy + sr * cp * sy
        qz = cr * cp * sy - sr * sp * cy

        return cls(x=x, y=y, z=z, qx=qx, qy=qy, qz=qz, qw=qw, frame_id=frame_id)


@dataclass
class Wrench:
    """Force and torque reading."""

    force_x: float = 0.0
    force_y: float = 0.0
    force_z: float = 0.0
    torque_x: float = 0.0
    torque_y: float = 0.0
    torque_z: float = 0.0

    def to_list(self) -> List[float]:
        return [
            self.force_x, self.force_y, self.force_z,
            self.torque_x, self.torque_y, self.torque_z,
        ]


@dataclass
class TelemetryFrame:
    """Complete telemetry frame from robot."""

    timestamp: float  # Unix timestamp in milliseconds

    # Joint state (manipulators)
    joint_state: Optional[JointState] = None

    # End effector pose (manipulators)
    end_effector_pose: Optional[Pose] = None

    # Force/torque sensor
    force_torque: Optional[Wrench] = None

    # Mobile robot odometry
    odometry_pose: Optional[Pose] = None
    linear_velocity: Optional[List[float]] = None  # [vx, vy, vz]
    angular_velocity: Optional[List[float]] = None  # [wx, wy, wz]

    # System state
    battery_level: Optional[float] = None  # 0-100
    temperature: Optional[float] = None  # Celsius
    errors: List[str] = field(default_factory=list)

    # Custom sensor data
    custom_data: Dict[str, Any] = field(default_factory=dict)

    def to_council_format(self) -> Dict[str, Any]:
        """Convert to Council telemetry format."""
        data: Dict[str, Any] = {"timestamp": self.timestamp}

        if self.joint_state:
            data["jointPositions"] = self.joint_state.positions
            data["jointVelocities"] = self.joint_state.velocities

        if self.end_effector_pose:
            data["endEffectorPose"] = self.end_effector_pose.to_dict()

        if self.force_torque:
            data["forceTorque"] = self.force_torque.to_list()

        if self.battery_level is not None:
            data["batteryLevel"] = self.battery_level

        if self.errors:
            data["errors"] = self.errors

        if self.custom_data:
            data["custom"] = self.custom_data

        return data


class TelemetryStream:
    """
    Manages telemetry streaming to Council platform.

    Handles:
    - Buffering and rate limiting
    - Automatic reconnection
    - Data compression
    - Telemetry callbacks
    """

    def __init__(
        self,
        target_rate: float = 20.0,  # Hz
        buffer_size: int = 100,
        compression: bool = True,
    ):
        self.target_rate = target_rate
        self.buffer_size = buffer_size
        self.compression = compression

        self._buffer: List[TelemetryFrame] = []
        self._callbacks: List[Callable[[TelemetryFrame], None]] = []
        self._running = False
        self._send_callback: Optional[Callable[[Dict[str, Any]], None]] = None

        # Statistics
        self._frames_sent = 0
        self._frames_dropped = 0
        self._last_send_time = 0.0

    def set_send_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Set callback for sending telemetry to Council."""
        self._send_callback = callback

    def add_callback(self, callback: Callable[[TelemetryFrame], None]):
        """Add callback for telemetry processing."""
        self._callbacks.append(callback)

    def push(self, frame: TelemetryFrame):
        """Push a telemetry frame to the buffer."""
        self._buffer.append(frame)

        # Drop old frames if buffer full
        if len(self._buffer) > self.buffer_size:
            self._buffer.pop(0)
            self._frames_dropped += 1

        # Notify callbacks
        for callback in self._callbacks:
            try:
                callback(frame)
            except Exception as e:
                logger.error(f"Telemetry callback error: {e}")

    def push_joint_state(
        self,
        names: List[str],
        positions: List[float],
        velocities: Optional[List[float]] = None,
        efforts: Optional[List[float]] = None,
    ):
        """Convenience method to push joint state."""
        frame = TelemetryFrame(
            timestamp=datetime.now().timestamp() * 1000,
            joint_state=JointState(
                names=names,
                positions=positions,
                velocities=velocities or [],
                efforts=efforts or [],
            ),
        )
        self.push(frame)

    def push_end_effector_pose(self, pose: Pose):
        """Convenience method to push end effector pose."""
        frame = TelemetryFrame(
            timestamp=datetime.now().timestamp() * 1000,
            end_effector_pose=pose,
        )
        self.push(frame)

    async def start_streaming(self):
        """Start streaming telemetry to Council."""
        self._running = True
        interval = 1.0 / self.target_rate

        while self._running:
            if self._buffer and self._send_callback:
                # Get latest frame
                frame = self._buffer[-1]

                # Send to Council
                try:
                    data = frame.to_council_format()
                    await self._send_callback(data)
                    self._frames_sent += 1
                    self._last_send_time = datetime.now().timestamp()
                except Exception as e:
                    logger.error(f"Telemetry send error: {e}")

            await asyncio.sleep(interval)

    def stop_streaming(self):
        """Stop streaming."""
        self._running = False

    def get_stats(self) -> Dict[str, Any]:
        """Get streaming statistics."""
        return {
            "frames_sent": self._frames_sent,
            "frames_dropped": self._frames_dropped,
            "buffer_size": len(self._buffer),
            "target_rate": self.target_rate,
            "last_send_time": self._last_send_time,
        }

    def get_latest(self) -> Optional[TelemetryFrame]:
        """Get the latest telemetry frame."""
        return self._buffer[-1] if self._buffer else None

    def clear_buffer(self):
        """Clear the telemetry buffer."""
        self._buffer = []


class TelemetryRecorder:
    """
    Records telemetry for offline analysis and RLHF.

    Saves telemetry to files for later processing,
    useful for generating training datasets.
    """

    def __init__(self, output_dir: str = "./telemetry"):
        self.output_dir = output_dir
        self._recording = False
        self._frames: List[TelemetryFrame] = []
        self._session_id: Optional[str] = None

    def start_recording(self, session_id: str):
        """Start recording telemetry."""
        import os
        os.makedirs(self.output_dir, exist_ok=True)

        self._session_id = session_id
        self._recording = True
        self._frames = []
        logger.info(f"Started telemetry recording: {session_id}")

    def record(self, frame: TelemetryFrame):
        """Record a telemetry frame."""
        if self._recording:
            self._frames.append(frame)

    def stop_recording(self) -> str:
        """Stop recording and save to file."""
        self._recording = False

        if not self._frames:
            logger.warning("No frames recorded")
            return ""

        import json
        import os

        filename = f"{self.output_dir}/{self._session_id}_telemetry.json"

        data = {
            "session_id": self._session_id,
            "frame_count": len(self._frames),
            "start_time": self._frames[0].timestamp,
            "end_time": self._frames[-1].timestamp,
            "frames": [f.to_council_format() for f in self._frames],
        }

        with open(filename, "w") as f:
            json.dump(data, f, indent=2)

        logger.info(f"Saved {len(self._frames)} frames to {filename}")
        return filename
