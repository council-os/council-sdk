"""
Council Robotics SDK

Python SDK for connecting robots to the Council platform.
Enables AI agents to deliberate on and control physical robots
with human oversight and correction capabilities.

Supports:
- ROS2 Integration
- WebSocket communication
- Telemetry streaming
- Command execution
- Human correction capture for RLHF
"""

from .client import CouncilRoboticsClient
from .robot import RobotConnection, RobotIdentity
from .telemetry import TelemetryStream
from .commands import RobotCommand, CommandResult
from .corrections import CorrectionCapture
from .ros2_bridge import ROS2Bridge

__version__ = "1.0.0"
__all__ = [
    "CouncilRoboticsClient",
    "RobotConnection",
    "RobotIdentity",
    "TelemetryStream",
    "RobotCommand",
    "CommandResult",
    "CorrectionCapture",
    "ROS2Bridge",
]
