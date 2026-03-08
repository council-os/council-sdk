"""
Robot Commands

Command types and execution for robot control.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import asyncio
import uuid


class CommandType(Enum):
    """Types of robot commands."""

    MOVE_JOINTS = "move_joints"
    MOVE_CARTESIAN = "move_cartesian"
    MOVE_LINEAR = "move_linear"
    GRIPPER = "gripper"
    VELOCITY = "velocity"
    HOME = "home"
    STOP = "stop"
    CUSTOM = "custom"


class CommandPriority(Enum):
    """Command priority levels."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    EMERGENCY = "emergency"


class CommandStatus(Enum):
    """Command execution status."""

    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class RobotCommand:
    """
    Command to be executed by a robot.

    Represents a single action to be performed,
    including parameters and execution constraints.
    """

    command_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    command_type: CommandType = CommandType.CUSTOM
    parameters: Dict[str, Any] = field(default_factory=dict)
    priority: CommandPriority = CommandPriority.NORMAL
    timeout: float = 30.0  # seconds

    # Execution context
    step_id: Optional[str] = None  # Part of execution plan
    plan_id: Optional[str] = None

    # Timing
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Status
    status: CommandStatus = CommandStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    @classmethod
    def move_joints(
        cls,
        positions: List[float],
        velocities: Optional[List[float]] = None,
        accelerations: Optional[List[float]] = None,
        joint_names: Optional[List[str]] = None,
        duration: Optional[float] = None,
        priority: CommandPriority = CommandPriority.NORMAL,
    ) -> "RobotCommand":
        """Create a joint space movement command."""
        params = {"positions": positions}
        if velocities:
            params["velocities"] = velocities
        if accelerations:
            params["accelerations"] = accelerations
        if joint_names:
            params["joint_names"] = joint_names
        if duration:
            params["duration"] = duration

        return cls(
            command_type=CommandType.MOVE_JOINTS,
            parameters=params,
            priority=priority,
        )

    @classmethod
    def move_cartesian(
        cls,
        x: float,
        y: float,
        z: float,
        qx: float = 0.0,
        qy: float = 0.0,
        qz: float = 0.0,
        qw: float = 1.0,
        frame_id: str = "base_link",
        linear: bool = True,
        velocity: Optional[float] = None,
        priority: CommandPriority = CommandPriority.NORMAL,
    ) -> "RobotCommand":
        """Create a Cartesian space movement command."""
        return cls(
            command_type=CommandType.MOVE_CARTESIAN if not linear else CommandType.MOVE_LINEAR,
            parameters={
                "pose": {"x": x, "y": y, "z": z, "qx": qx, "qy": qy, "qz": qz, "qw": qw},
                "frame_id": frame_id,
                "velocity": velocity,
            },
            priority=priority,
        )

    @classmethod
    def gripper(
        cls,
        action: str = "close",  # "open", "close", "position"
        position: float = 0.0,  # 0=closed, 1=open (normalized)
        force: Optional[float] = None,
        priority: CommandPriority = CommandPriority.NORMAL,
    ) -> "RobotCommand":
        """Create a gripper command."""
        params = {"action": action, "position": position}
        if force:
            params["force"] = force

        return cls(
            command_type=CommandType.GRIPPER,
            parameters=params,
            priority=priority,
        )

    @classmethod
    def velocity(
        cls,
        linear_x: float = 0.0,
        linear_y: float = 0.0,
        linear_z: float = 0.0,
        angular_x: float = 0.0,
        angular_y: float = 0.0,
        angular_z: float = 0.0,
        duration: Optional[float] = None,
        priority: CommandPriority = CommandPriority.NORMAL,
    ) -> "RobotCommand":
        """Create a velocity command (mobile robots)."""
        return cls(
            command_type=CommandType.VELOCITY,
            parameters={
                "linear": {"x": linear_x, "y": linear_y, "z": linear_z},
                "angular": {"x": angular_x, "y": angular_y, "z": angular_z},
                "duration": duration,
            },
            priority=priority,
        )

    @classmethod
    def home(cls, priority: CommandPriority = CommandPriority.NORMAL) -> "RobotCommand":
        """Create a home position command."""
        return cls(
            command_type=CommandType.HOME,
            parameters={},
            priority=priority,
        )

    @classmethod
    def stop(cls) -> "RobotCommand":
        """Create an emergency stop command."""
        return cls(
            command_type=CommandType.STOP,
            parameters={},
            priority=CommandPriority.EMERGENCY,
            timeout=0.1,  # Immediate
        )

    @classmethod
    def custom(
        cls,
        action: str,
        parameters: Dict[str, Any] = None,
        priority: CommandPriority = CommandPriority.NORMAL,
    ) -> "RobotCommand":
        """Create a custom command."""
        params = parameters or {}
        params["action"] = action

        return cls(
            command_type=CommandType.CUSTOM,
            parameters=params,
            priority=priority,
        )

    def to_council_format(self) -> Dict[str, Any]:
        """Convert to Council command format."""
        return {
            "id": self.command_id,
            "type": self.command_type.value,
            "parameters": self.parameters,
            "priority": self.priority.value,
            "timeout": self.timeout,
            "stepId": self.step_id,
            "planId": self.plan_id,
        }

    def mark_started(self):
        """Mark command as started."""
        self.status = CommandStatus.EXECUTING
        self.started_at = datetime.now()

    def mark_completed(self, result: Optional[Dict[str, Any]] = None):
        """Mark command as completed."""
        self.status = CommandStatus.COMPLETED
        self.completed_at = datetime.now()
        self.result = result

    def mark_failed(self, error: str):
        """Mark command as failed."""
        self.status = CommandStatus.FAILED
        self.completed_at = datetime.now()
        self.error = error

    @property
    def execution_time(self) -> Optional[float]:
        """Get execution time in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class CommandResult:
    """Result of a robot command execution."""

    command_id: str
    success: bool
    status: CommandStatus

    # Timing
    execution_time: Optional[float] = None

    # Result data
    result_data: Dict[str, Any] = field(default_factory=dict)
    error_message: Optional[str] = None

    # Final state (for verification)
    final_joint_positions: Optional[List[float]] = None
    final_end_effector_pose: Optional[Dict[str, float]] = None

    @classmethod
    def success(
        cls,
        command_id: str,
        execution_time: float,
        result_data: Optional[Dict[str, Any]] = None,
    ) -> "CommandResult":
        """Create a successful result."""
        return cls(
            command_id=command_id,
            success=True,
            status=CommandStatus.COMPLETED,
            execution_time=execution_time,
            result_data=result_data or {},
        )

    @classmethod
    def failure(
        cls,
        command_id: str,
        error_message: str,
        execution_time: Optional[float] = None,
    ) -> "CommandResult":
        """Create a failed result."""
        return cls(
            command_id=command_id,
            success=False,
            status=CommandStatus.FAILED,
            execution_time=execution_time,
            error_message=error_message,
        )


class CommandQueue:
    """
    Queue for managing robot commands.

    Handles command prioritization, rate limiting,
    and execution tracking.
    """

    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self._queue: List[RobotCommand] = []
        self._executing: Optional[RobotCommand] = None
        self._history: List[RobotCommand] = []

    def enqueue(self, command: RobotCommand) -> bool:
        """Add command to queue."""
        if len(self._queue) >= self.max_size:
            return False

        # Insert based on priority
        inserted = False
        for i, cmd in enumerate(self._queue):
            if command.priority.value > cmd.priority.value:
                self._queue.insert(i, command)
                inserted = True
                break

        if not inserted:
            self._queue.append(command)

        return True

    def dequeue(self) -> Optional[RobotCommand]:
        """Get next command to execute."""
        if not self._queue:
            return None

        command = self._queue.pop(0)
        self._executing = command
        command.mark_started()
        return command

    def complete_current(self, result: Optional[Dict[str, Any]] = None):
        """Mark current command as completed."""
        if self._executing:
            self._executing.mark_completed(result)
            self._history.append(self._executing)
            self._executing = None

    def fail_current(self, error: str):
        """Mark current command as failed."""
        if self._executing:
            self._executing.mark_failed(error)
            self._history.append(self._executing)
            self._executing = None

    def cancel_all(self):
        """Cancel all queued commands."""
        for cmd in self._queue:
            cmd.status = CommandStatus.CANCELLED
            self._history.append(cmd)
        self._queue = []

    def get_pending(self) -> List[RobotCommand]:
        """Get all pending commands."""
        return list(self._queue)

    def get_history(self, limit: int = 50) -> List[RobotCommand]:
        """Get command history."""
        return self._history[-limit:]

    @property
    def size(self) -> int:
        """Get queue size."""
        return len(self._queue)

    @property
    def is_executing(self) -> bool:
        """Check if a command is executing."""
        return self._executing is not None
