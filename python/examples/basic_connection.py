#!/usr/bin/env python3
"""
Basic Connection Example

Minimal example showing how to connect any robot to Council
without ROS2 dependencies.

This example works with:
- Custom robots with proprietary SDKs
- Simulation environments
- Simple microcontroller-based robots
- Any robot that can run Python
"""

import asyncio
import os
import sys
import time
import random
from typing import Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from council_robotics import CouncilRoboticsClient


class SimpleRobotSimulator:
    """
    Simulates a simple 6-DOF robot arm.
    Replace this with your actual robot interface.
    """

    def __init__(self):
        self.joint_positions = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        self.gripper_position = 1.0  # 1.0 = open, 0.0 = closed
        self.battery_level = 100.0
        self.errors = []

    def get_telemetry(self) -> Dict[str, Any]:
        """Get current robot state."""
        # Simulate small variations
        self.battery_level = max(0, self.battery_level - 0.001)

        return {
            "joint_positions": self.joint_positions.copy(),
            "joint_velocities": [0.0] * 6,
            "end_effector_pose": self._calculate_fk(),
            "battery_level": self.battery_level,
            "errors": self.errors,
        }

    def _calculate_fk(self) -> Dict[str, float]:
        """Simplified forward kinematics."""
        # Placeholder - in reality, compute from joint positions
        return {
            "x": 0.5 + self.joint_positions[0] * 0.1,
            "y": 0.0 + self.joint_positions[1] * 0.1,
            "z": 0.5 + self.joint_positions[2] * 0.1,
            "qx": 0.0, "qy": 0.707, "qz": 0.0, "qw": 0.707,
        }

    def move_joints(self, positions: list, duration: float = 2.0) -> bool:
        """Move to joint positions (simulated)."""
        print(f"[SIM] Moving to joints: {positions}")

        # Simulate gradual movement
        steps = int(duration * 10)
        for i in range(steps):
            for j in range(6):
                diff = positions[j] - self.joint_positions[j]
                self.joint_positions[j] += diff / (steps - i)
            time.sleep(duration / steps)

        self.joint_positions = positions.copy()
        return True

    def move_gripper(self, position: float) -> bool:
        """Move gripper (0=closed, 1=open)."""
        print(f"[SIM] Gripper: {'open' if position > 0.5 else 'closed'}")
        self.gripper_position = position
        return True

    def stop(self):
        """Emergency stop."""
        print("[SIM] EMERGENCY STOP")
        self.errors.append("Emergency stop triggered")


async def main():
    """Main example."""

    # Configuration
    council_url = os.getenv("COUNCIL_URL", "http://localhost:4000")
    robot_id = os.getenv("ROBOT_ID", "simple-robot-001")
    api_key = os.getenv("COUNCIL_API_KEY", "")

    print(f"Connecting to Council at {council_url}")
    print(f"Robot ID: {robot_id}")

    # Create robot simulator (replace with your actual robot)
    robot = SimpleRobotSimulator()

    # Create Council client
    client = CouncilRoboticsClient(
        base_url=council_url,
        api_key=api_key,
        robot_id=robot_id,
    )

    # =========================================================================
    # Register Command Handlers
    # =========================================================================

    async def handle_command(data: Dict[str, Any]):
        """Handle commands from Council/AI agents."""
        command = data.get("command", {})
        cmd_id = command.get("id", "unknown")
        cmd_type = command.get("type", "unknown")
        params = command.get("parameters", {})

        print(f"Received command: {cmd_type} ({cmd_id})")

        success = False
        result = {}

        try:
            if cmd_type == "move_joints":
                positions = params.get("positions", [])
                duration = params.get("duration", 2.0)
                success = robot.move_joints(positions, duration)
                result = {"final_positions": robot.joint_positions}

            elif cmd_type == "gripper":
                action = params.get("action", "close")
                if action == "open":
                    success = robot.move_gripper(1.0)
                else:
                    success = robot.move_gripper(0.0)
                result = {"gripper_position": robot.gripper_position}

            elif cmd_type == "home":
                success = robot.move_joints([0.0, -1.57, 1.57, 0.0, 0.0, 0.0])
                result = {"at_home": True}

            elif cmd_type == "stop":
                robot.stop()
                success = True
                result = {"stopped": True}

            elif cmd_type == "custom":
                action = params.get("action", "")
                print(f"Custom action: {action}")
                success = True
                result = {"action": action, "executed": True}

            else:
                result = {"error": f"Unknown command type: {cmd_type}"}

        except Exception as e:
            result = {"error": str(e)}

        # Report result back to Council
        await client.report_command_result(cmd_id, success, result)

    async def handle_pause(data: Dict[str, Any]):
        """Handle pause command."""
        print("⏸️  Execution paused by operator")

    async def handle_resume(data: Dict[str, Any]):
        """Handle resume command."""
        print("▶️  Execution resumed")

    async def handle_abort(data: Dict[str, Any]):
        """Handle abort command."""
        print("🛑 Execution aborted!")
        robot.stop()

    # Register handlers
    client.on_message("command", handle_command)
    client.on_message("pause", handle_pause)
    client.on_message("resume", handle_resume)
    client.on_message("abort", handle_abort)

    # =========================================================================
    # Connect and Run
    # =========================================================================

    if not await client.connect():
        print("Failed to connect to Council")
        return

    print("✅ Connected to Council!")
    print("Streaming telemetry... Press Ctrl+C to exit.")

    try:
        # Main loop - stream telemetry
        iteration = 0
        while True:
            telemetry = robot.get_telemetry()

            await client.send_telemetry(
                joint_positions=telemetry["joint_positions"],
                joint_velocities=telemetry["joint_velocities"],
                end_effector_pose=telemetry["end_effector_pose"],
                battery_level=telemetry["battery_level"],
                errors=telemetry["errors"] if telemetry["errors"] else None,
            )

            iteration += 1
            if iteration % 100 == 0:  # Every ~5 seconds at 20Hz
                print(f"📡 Sent {iteration} telemetry frames, battery: {telemetry['battery_level']:.1f}%")

            await asyncio.sleep(0.05)  # 20 Hz

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        await client.disconnect()
        print("Disconnected from Council")


if __name__ == "__main__":
    asyncio.run(main())
