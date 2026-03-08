"""
Human Correction Capture

Captures human corrections during robot operation for RLHF training.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger(__name__)


class CorrectionType(Enum):
    """Types of corrections."""

    REORDER = "reorder"  # Change step order
    EDIT = "edit"  # Modify step parameters
    ADD = "add"  # Add new step
    REMOVE = "remove"  # Remove step
    ABORT = "abort"  # Abort execution
    TRAJECTORY = "trajectory"  # Modify trajectory
    TIMING = "timing"  # Adjust timing
    FORCE = "force"  # Adjust force/compliance
    POSITION = "position"  # Fine-tune position


class CorrectionSource(Enum):
    """Source of correction."""

    KEYBOARD = "keyboard"  # Keyboard input
    JOYSTICK = "joystick"  # Joystick/gamepad
    TEACH_PENDANT = "teach_pendant"  # Robot teach pendant
    VR = "vr"  # VR controller
    VOICE = "voice"  # Voice command
    GUI = "gui"  # GUI interface
    API = "api"  # Programmatic


@dataclass
class Correction:
    """
    A single human correction during robot operation.

    Captures the context, original value, corrected value,
    and reason for the correction for RLHF training.
    """

    correction_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    correction_type: CorrectionType = CorrectionType.EDIT
    source: CorrectionSource = CorrectionSource.GUI

    # Context
    step_id: Optional[str] = None
    plan_id: Optional[str] = None
    session_id: Optional[str] = None

    # Values
    original_value: Any = None
    corrected_value: Any = None

    # Explanation
    reason: Optional[str] = None
    severity: str = "medium"  # low, medium, high, critical

    # Timing
    timestamp: datetime = field(default_factory=datetime.now)

    # State context
    robot_state_before: Optional[Dict[str, Any]] = None
    scene_context: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API/storage."""
        return {
            "correctionId": self.correction_id,
            "correctionType": self.correction_type.value,
            "source": self.source.value,
            "stepId": self.step_id,
            "planId": self.plan_id,
            "sessionId": self.session_id,
            "originalValue": self.original_value,
            "correctedValue": self.corrected_value,
            "reason": self.reason,
            "severity": self.severity,
            "timestamp": self.timestamp.isoformat(),
            "robotStateBefore": self.robot_state_before,
            "sceneContext": self.scene_context,
        }

    def to_rlhf_format(self) -> Dict[str, Any]:
        """Convert to RLHF training format."""
        return {
            "type": "human_correction",
            "correction_type": self.correction_type.value,
            "context": {
                "step_id": self.step_id,
                "plan_id": self.plan_id,
                "robot_state": self.robot_state_before,
                "scene": self.scene_context,
            },
            "original": self.original_value,
            "corrected": self.corrected_value,
            "preference": "corrected",  # Human prefers corrected
            "metadata": {
                "source": self.source.value,
                "reason": self.reason,
                "severity": self.severity,
                "timestamp": self.timestamp.isoformat(),
            },
        }


class CorrectionCapture:
    """
    Captures and manages human corrections during robot operation.

    Provides tools for:
    - Recording corrections in real-time
    - Exporting for RLHF training
    - Analyzing correction patterns
    """

    def __init__(
        self,
        session_id: Optional[str] = None,
        auto_save: bool = True,
        output_dir: str = "./corrections",
    ):
        self.session_id = session_id or str(uuid.uuid4())
        self.auto_save = auto_save
        self.output_dir = output_dir

        self._corrections: List[Correction] = []
        self._send_callback: Optional[callable] = None

    def set_send_callback(self, callback: callable):
        """Set callback for sending corrections to Council."""
        self._send_callback = callback

    async def capture(
        self,
        correction_type: CorrectionType,
        original_value: Any,
        corrected_value: Any,
        step_id: Optional[str] = None,
        plan_id: Optional[str] = None,
        reason: Optional[str] = None,
        source: CorrectionSource = CorrectionSource.GUI,
        severity: str = "medium",
        robot_state: Optional[Dict[str, Any]] = None,
        scene_context: Optional[Dict[str, Any]] = None,
    ) -> Correction:
        """
        Capture a human correction.

        Args:
            correction_type: Type of correction
            original_value: Original value before correction
            corrected_value: Value after correction
            step_id: ID of the step being corrected
            plan_id: ID of the execution plan
            reason: Human-provided reason for correction
            source: Input source of correction
            severity: Severity level of the correction
            robot_state: Robot state at time of correction
            scene_context: Scene context at time of correction

        Returns:
            The captured Correction object
        """
        correction = Correction(
            correction_type=correction_type,
            source=source,
            step_id=step_id,
            plan_id=plan_id,
            session_id=self.session_id,
            original_value=original_value,
            corrected_value=corrected_value,
            reason=reason,
            severity=severity,
            robot_state_before=robot_state,
            scene_context=scene_context,
        )

        self._corrections.append(correction)
        logger.info(f"Captured correction: {correction_type.value} on step {step_id}")

        # Send to Council if callback set
        if self._send_callback:
            try:
                await self._send_callback(correction.to_dict())
            except Exception as e:
                logger.error(f"Failed to send correction: {e}")

        return correction

    def capture_trajectory_correction(
        self,
        original_trajectory: List[List[float]],
        corrected_trajectory: List[List[float]],
        step_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Correction:
        """Convenience method for trajectory corrections."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self.capture(
                correction_type=CorrectionType.TRAJECTORY,
                original_value={"trajectory": original_trajectory},
                corrected_value={"trajectory": corrected_trajectory},
                step_id=step_id,
                reason=reason,
            )
        )

    def capture_position_correction(
        self,
        original_position: Dict[str, float],
        corrected_position: Dict[str, float],
        step_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Correction:
        """Convenience method for position corrections."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self.capture(
                correction_type=CorrectionType.POSITION,
                original_value=original_position,
                corrected_value=corrected_position,
                step_id=step_id,
                reason=reason,
            )
        )

    def get_corrections(
        self,
        correction_type: Optional[CorrectionType] = None,
        step_id: Optional[str] = None,
    ) -> List[Correction]:
        """Get corrections, optionally filtered."""
        result = self._corrections

        if correction_type:
            result = [c for c in result if c.correction_type == correction_type]

        if step_id:
            result = [c for c in result if c.step_id == step_id]

        return result

    def get_statistics(self) -> Dict[str, Any]:
        """Get correction statistics."""
        by_type: Dict[str, int] = {}
        by_severity: Dict[str, int] = {}
        by_source: Dict[str, int] = {}

        for correction in self._corrections:
            ct = correction.correction_type.value
            by_type[ct] = by_type.get(ct, 0) + 1

            by_severity[correction.severity] = by_severity.get(correction.severity, 0) + 1

            src = correction.source.value
            by_source[src] = by_source.get(src, 0) + 1

        return {
            "total_corrections": len(self._corrections),
            "by_type": by_type,
            "by_severity": by_severity,
            "by_source": by_source,
            "session_id": self.session_id,
        }

    def export_for_rlhf(self) -> List[Dict[str, Any]]:
        """Export corrections in RLHF training format."""
        return [c.to_rlhf_format() for c in self._corrections]

    def save_to_file(self, filename: Optional[str] = None) -> str:
        """Save corrections to JSON file."""
        import os
        os.makedirs(self.output_dir, exist_ok=True)

        if not filename:
            filename = f"{self.output_dir}/{self.session_id}_corrections.json"

        data = {
            "session_id": self.session_id,
            "correction_count": len(self._corrections),
            "statistics": self.get_statistics(),
            "corrections": [c.to_dict() for c in self._corrections],
            "rlhf_format": self.export_for_rlhf(),
        }

        with open(filename, "w") as f:
            json.dump(data, f, indent=2, default=str)

        logger.info(f"Saved {len(self._corrections)} corrections to {filename}")
        return filename

    def clear(self):
        """Clear all corrections."""
        if self.auto_save and self._corrections:
            self.save_to_file()
        self._corrections = []


class TeachingSession:
    """
    Interactive teaching session for robot learning.

    Allows human operators to demonstrate tasks while
    capturing corrections and preferences for training.
    """

    def __init__(
        self,
        robot_id: str,
        task_name: str,
        correction_capture: Optional[CorrectionCapture] = None,
    ):
        self.robot_id = robot_id
        self.task_name = task_name
        self.session_id = str(uuid.uuid4())

        self.correction_capture = correction_capture or CorrectionCapture(
            session_id=self.session_id
        )

        self._demonstrations: List[Dict[str, Any]] = []
        self._started_at: Optional[datetime] = None
        self._ended_at: Optional[datetime] = None

    def start(self):
        """Start teaching session."""
        self._started_at = datetime.now()
        logger.info(f"Teaching session started: {self.task_name}")

    def record_demonstration(
        self,
        trajectory: List[Dict[str, Any]],
        description: Optional[str] = None,
        success: bool = True,
    ):
        """Record a demonstration."""
        demo = {
            "demo_id": str(uuid.uuid4()),
            "trajectory": trajectory,
            "description": description,
            "success": success,
            "timestamp": datetime.now().isoformat(),
        }
        self._demonstrations.append(demo)
        logger.info(f"Recorded demonstration {len(self._demonstrations)}")

    def end(self) -> Dict[str, Any]:
        """End teaching session and export data."""
        self._ended_at = datetime.now()

        duration = (self._ended_at - self._started_at).total_seconds() if self._started_at else 0

        result = {
            "session_id": self.session_id,
            "robot_id": self.robot_id,
            "task_name": self.task_name,
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "ended_at": self._ended_at.isoformat(),
            "duration_seconds": duration,
            "demonstrations": self._demonstrations,
            "corrections": self.correction_capture.export_for_rlhf(),
            "statistics": self.correction_capture.get_statistics(),
        }

        # Save corrections
        self.correction_capture.save_to_file()

        logger.info(f"Teaching session ended: {len(self._demonstrations)} demos, "
                   f"{len(self.correction_capture._corrections)} corrections")

        return result
