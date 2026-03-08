"""
Robot Identity and Connection Types

Data classes for robot registration, identity, and connection state.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class RobotType(Enum):
    """Types of robots supported by Council."""

    MANIPULATOR = "manipulator"  # Industrial robot arms
    MOBILE = "mobile"  # Mobile robots, AMRs
    DRONE = "drone"  # Aerial robots
    HUMANOID = "humanoid"  # Humanoid robots
    QUADRUPED = "quadruped"  # Four-legged robots
    CUSTOM = "custom"  # Custom robot types


class RobotStatus(Enum):
    """Robot connection status."""

    OFFLINE = "offline"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    READY = "ready"
    EXECUTING = "executing"
    ERROR = "error"
    MAINTENANCE = "maintenance"


@dataclass
class RobotCapability:
    """A capability that a robot possesses."""

    name: str
    version: str = "1.0"
    parameters: Dict[str, Any] = field(default_factory=dict)
    constraints: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RobotIdentity:
    """
    Robot identity and registration data.

    Represents a robot's identity in the Council platform,
    including cryptographic verification for secure operation.
    """

    robot_id: str
    name: str
    robot_type: RobotType
    manufacturer: str
    model: str
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None

    # Capabilities
    capabilities: List[RobotCapability] = field(default_factory=list)

    # Security
    public_key: Optional[str] = None

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RobotIdentity":
        """Create RobotIdentity from dictionary."""
        capabilities = [
            RobotCapability(**cap) if isinstance(cap, dict) else cap
            for cap in data.get("capabilities", [])
        ]

        robot_type = data.get("robotType", data.get("robot_type", "custom"))
        if isinstance(robot_type, str):
            robot_type = RobotType(robot_type)

        return cls(
            robot_id=data.get("robotId", data.get("robot_id", "")),
            name=data.get("name", ""),
            robot_type=robot_type,
            manufacturer=data.get("manufacturer", ""),
            model=data.get("model", ""),
            serial_number=data.get("serialNumber", data.get("serial_number")),
            firmware_version=data.get("firmwareVersion", data.get("firmware_version")),
            capabilities=capabilities,
            public_key=data.get("publicKey", data.get("public_key")),
            metadata=data.get("metadata", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API."""
        return {
            "robotId": self.robot_id,
            "name": self.name,
            "robotType": self.robot_type.value,
            "manufacturer": self.manufacturer,
            "model": self.model,
            "serialNumber": self.serial_number,
            "firmwareVersion": self.firmware_version,
            "capabilities": [
                {"name": cap.name, "version": cap.version, "parameters": cap.parameters}
                for cap in self.capabilities
            ],
            "publicKey": self.public_key,
            "metadata": self.metadata,
        }


@dataclass
class RobotConnection:
    """
    Active connection to a robot.

    Tracks the current connection state and provides
    methods for sending commands and receiving telemetry.
    """

    robot_id: str
    identity: Optional[RobotIdentity] = None
    status: RobotStatus = RobotStatus.OFFLINE
    session_id: Optional[str] = None

    # Connection details
    connection_id: Optional[str] = None
    connected_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None

    # Telemetry
    last_telemetry: Optional[Dict[str, Any]] = None
    telemetry_rate: float = 0.0  # Hz

    # Errors
    errors: List[str] = field(default_factory=list)

    def is_connected(self) -> bool:
        """Check if robot is connected."""
        return self.status in [
            RobotStatus.CONNECTED,
            RobotStatus.READY,
            RobotStatus.EXECUTING,
        ]

    def is_ready(self) -> bool:
        """Check if robot is ready to receive commands."""
        return self.status == RobotStatus.READY

    def update_status(self, status: RobotStatus):
        """Update connection status."""
        self.status = status
        if status == RobotStatus.CONNECTED:
            self.connected_at = datetime.now()

    def update_telemetry(self, telemetry: Dict[str, Any]):
        """Update latest telemetry."""
        self.last_telemetry = telemetry
        self.last_heartbeat = datetime.now()

    def add_error(self, error: str):
        """Add an error message."""
        self.errors.append(error)
        if len(self.errors) > 100:
            self.errors = self.errors[-50:]  # Keep last 50

    def clear_errors(self):
        """Clear error list."""
        self.errors = []


@dataclass
class RobotWallet:
    """
    Robot wallet for economic transactions.

    Enables robots to participate in the Council economic system,
    earning tokens for completed tasks and spending for resources.
    """

    robot_id: str
    wallet_address: str
    balance: float = 0.0
    pending_earnings: float = 0.0

    # Transaction history
    total_earned: float = 0.0
    total_spent: float = 0.0

    # Escrow
    escrow_balance: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RobotWallet":
        """Create from dictionary."""
        return cls(
            robot_id=data.get("robotId", ""),
            wallet_address=data.get("walletAddress", ""),
            balance=data.get("balance", 0.0),
            pending_earnings=data.get("pendingEarnings", 0.0),
            total_earned=data.get("totalEarned", 0.0),
            total_spent=data.get("totalSpent", 0.0),
            escrow_balance=data.get("escrowBalance", 0.0),
        )
