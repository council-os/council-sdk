#!/usr/bin/env python3
"""
Franka Emika Panda Integration Example

This example demonstrates connecting a Franka Panda robot to the Council platform.
Supports both ROS2 and libfranka direct interfaces.

Requirements:
- ROS2 with franka_ros2 or
- libfranka Python bindings

The Panda is a 7-DOF collaborative robot with advanced force control,
making it ideal for manipulation tasks with human corrections.
"""

import asyncio
import os
import sys
import time
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from council_robotics import CouncilRoboticsClient, CorrectionCapture, CorrectionType
from council_robotics.telemetry import TelemetryStream, TelemetryFrame, JointState, Pose, Wrench
from council_robotics.commands import RobotCommand, CommandQueue, CommandResult

# Try libfranka first, fall back to simulation
try:
    import panda_py
    HAS_LIBFRANKA = True
except ImportError:
    HAS_LIBFRANKA = False


class PandaController:
    """
    Controller for Franka Panda using libfranka Python bindings.
    """

    JOINT_NAMES = [
        "panda_joint1", "panda_joint2", "panda_joint3", "panda_joint4",
        "panda_joint5", "panda_joint6", "panda_joint7"
    ]

    HOME_POSITION = [0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785]

    def __init__(self, robot_ip: str = "172.16.0.2"):
        self.robot_ip = robot_ip
        self.robot = None
        self._connected = False

        if HAS_LIBFRANKA:
            try:
                self.robot = panda_py.Panda(robot_ip)
                self._connected = True
                print(f"Connected to Panda at {robot_ip}")
            except Exception as e:
                print(f"Failed to connect to Panda: {e}")
                print("Running in simulation mode")
        else:
            print("libfranka not available, running in simulation mode")

    def is_connected(self) -> bool:
        return self._connected

    def get_joint_state(self) -> Dict[str, Any]:
        """Get current joint state."""
        if self.robot:
            state = self.robot.get_state()
            return {
                "positions": list(state.q),
                "velocities": list(state.dq),
                "efforts": list(state.tau_J),
            }
        else:
            # Simulation
            return {
                "positions": self.HOME_POSITION.copy(),
                "velocities": [0.0] * 7,
                "efforts": [0.0] * 7,
            }

    def get_end_effector_pose(self) -> Dict[str, float]:
        """Get end effector pose."""
        if self.robot:
            state = self.robot.get_state()
            # Extract from 4x4 transformation matrix
            O_T_EE = state.O_T_EE
            return {
                "x": O_T_EE[12],
                "y": O_T_EE[13],
                "z": O_T_EE[14],
                # Quaternion from rotation matrix (simplified)
                "qx": 0.0, "qy": 0.0, "qz": 0.0, "qw": 1.0,
            }
        else:
            return {"x": 0.5, "y": 0.0, "z": 0.5, "qx": 0.0, "qy": 0.707, "qz": 0.0, "qw": 0.707}

    def get_external_wrench(self) -> List[float]:
        """Get external force/torque."""
        if self.robot:
            state = self.robot.get_state()
            return list(state.O_F_ext_hat_K)
        else:
            return [0.0, 0.0, -5.0, 0.0, 0.0, 0.0]

    def move_to_joint_positions(
        self,
        positions: List[float],
        speed_factor: float = 0.3,
    ) -> bool:
        """Move to joint positions."""
        if len(positions) != 7:
            raise ValueError("Panda requires 7 joint positions")

        if self.robot:
            try:
                self.robot.move_to_joint_position(
                    positions,
                    speed_factor=speed_factor,
                )
                return True
            except Exception as e:
                print(f"Motion failed: {e}")
                return False
        else:
            print(f"[SIM] Moving to: {positions}")
            time.sleep(1.0)
            return True

    def move_to_pose(
        self,
        pose: Dict[str, float],
        speed_factor: float = 0.3,
    ) -> bool:
        """Move end effector to Cartesian pose."""
        if self.robot:
            try:
                self.robot.move_to_pose(
                    position=[pose["x"], pose["y"], pose["z"]],
                    orientation=[pose.get("qw", 1.0), pose.get("qx", 0.0),
                               pose.get("qy", 0.0), pose.get("qz", 0.0)],
                    speed_factor=speed_factor,
                )
                return True
            except Exception as e:
                print(f"Motion failed: {e}")
                return False
        else:
            print(f"[SIM] Moving to pose: {pose}")
            time.sleep(1.0)
            return True

    def gripper_open(self, width: float = 0.08):
        """Open gripper."""
        if self.robot:
            self.robot.get_gripper().open(width)
        else:
            print(f"[SIM] Gripper open: {width}m")

    def gripper_close(self, width: float = 0.0, force: float = 20.0):
        """Close gripper."""
        if self.robot:
            self.robot.get_gripper().close(width, force)
        else:
            print(f"[SIM] Gripper close: {width}m, {force}N")

    def stop(self):
        """Emergency stop."""
        if self.robot:
            self.robot.stop()
        print("Robot stopped")


class PandaCouncilClient:
    """
    Council client wrapper for Franka Panda.
    """

    def __init__(
        self,
        robot_ip: str = "172.16.0.2",
        council_url: str = "http://localhost:4000",
        robot_id: str = "panda-001",
        api_key: str = "",
    ):
        self.controller = PandaController(robot_ip)
        self.council = CouncilRoboticsClient(
            base_url=council_url,
            api_key=api_key,
            robot_id=robot_id,
        )

        self.telemetry = TelemetryStream(target_rate=50.0)
        self.correction_capture = CorrectionCapture(session_id=f"panda_{robot_id}")
        self.command_queue = CommandQueue()

        self._running = False
        self._tasks = []

    async def connect(self) -> bool:
        """Connect to Council and start streaming."""
        # Register command handler
        self.council.on_message("command", self._handle_command)
        self.council.on_message("pause", self._handle_pause)
        self.council.on_message("abort", self._handle_abort)

        # Connect
        if not await self.council.connect():
            return False

        # Set telemetry send callback
        async def send_telemetry(data):
            await self.council.send_telemetry(**data)

        self.telemetry.set_send_callback(send_telemetry)

        # Start background tasks
        self._running = True
        self._tasks.append(asyncio.create_task(self._telemetry_loop()))
        self._tasks.append(asyncio.create_task(self._command_loop()))

        return True

    async def disconnect(self):
        """Disconnect and cleanup."""
        self._running = False

        for task in self._tasks:
            task.cancel()

        self.correction_capture.save_to_file()
        await self.council.disconnect()

    async def _telemetry_loop(self):
        """Continuously stream telemetry."""
        while self._running:
            try:
                # Get current state
                joint_state = self.controller.get_joint_state()
                ee_pose = self.controller.get_end_effector_pose()
                wrench = self.controller.get_external_wrench()

                # Create frame
                frame = TelemetryFrame(
                    timestamp=time.time() * 1000,
                    joint_state=JointState(
                        names=PandaController.JOINT_NAMES,
                        positions=joint_state["positions"],
                        velocities=joint_state["velocities"],
                        efforts=joint_state["efforts"],
                    ),
                    end_effector_pose=Pose(**ee_pose),
                    force_torque=Wrench(*wrench),
                )

                # Push to stream
                self.telemetry.push(frame)

                # Send to Council
                await self.council.send_telemetry(
                    joint_positions=joint_state["positions"],
                    joint_velocities=joint_state["velocities"],
                    end_effector_pose=ee_pose,
                    force_torque=wrench,
                )

            except Exception as e:
                print(f"Telemetry error: {e}")

            await asyncio.sleep(0.02)  # 50 Hz

    async def _command_loop(self):
        """Process command queue."""
        while self._running:
            if self.command_queue.size > 0:
                cmd = self.command_queue.dequeue()
                if cmd:
                    result = await self._execute_command(cmd)

                    if result.success:
                        self.command_queue.complete_current(result.result_data)
                    else:
                        self.command_queue.fail_current(result.error_message or "Unknown error")

                    # Report to Council
                    await self.council.report_command_result(
                        command_id=cmd.command_id,
                        success=result.success,
                        result=result.result_data,
                    )

            await asyncio.sleep(0.01)

    async def _execute_command(self, cmd: RobotCommand) -> CommandResult:
        """Execute a robot command."""
        start_time = time.time()

        try:
            if cmd.command_type.value == "move_joints":
                positions = cmd.parameters.get("positions", [])
                speed = cmd.parameters.get("speed_factor", 0.3)
                success = self.controller.move_to_joint_positions(positions, speed)

            elif cmd.command_type.value == "move_cartesian":
                pose = cmd.parameters.get("pose", {})
                speed = cmd.parameters.get("speed_factor", 0.3)
                success = self.controller.move_to_pose(pose, speed)

            elif cmd.command_type.value == "gripper":
                action = cmd.parameters.get("action", "close")
                if action == "open":
                    self.controller.gripper_open()
                else:
                    force = cmd.parameters.get("force", 20.0)
                    self.controller.gripper_close(force=force)
                success = True

            elif cmd.command_type.value == "home":
                success = self.controller.move_to_joint_positions(
                    PandaController.HOME_POSITION
                )

            elif cmd.command_type.value == "stop":
                self.controller.stop()
                success = True

            else:
                return CommandResult.failure(
                    cmd.command_id,
                    f"Unknown command type: {cmd.command_type.value}"
                )

            exec_time = time.time() - start_time

            if success:
                return CommandResult.success(
                    cmd.command_id,
                    exec_time,
                    {"final_state": self.controller.get_joint_state()}
                )
            else:
                return CommandResult.failure(cmd.command_id, "Execution failed", exec_time)

        except Exception as e:
            return CommandResult.failure(cmd.command_id, str(e), time.time() - start_time)

    async def _handle_command(self, data: Dict[str, Any]):
        """Handle command from Council."""
        cmd_data = data.get("command", {})

        cmd = RobotCommand(
            command_id=cmd_data.get("id", ""),
            command_type=cmd_data.get("type", "custom"),
            parameters=cmd_data.get("parameters", {}),
            step_id=cmd_data.get("stepId"),
            plan_id=cmd_data.get("planId"),
        )

        self.command_queue.enqueue(cmd)

    async def _handle_pause(self, data: Dict[str, Any]):
        """Handle pause command."""
        print("Pausing...")
        # Could implement hold behavior

    async def _handle_abort(self, data: Dict[str, Any]):
        """Handle abort command."""
        print("Aborting!")
        self.controller.stop()
        self.command_queue.cancel_all()


async def main():
    """Main entry point."""
    client = PandaCouncilClient(
        robot_ip=os.getenv("PANDA_IP", "172.16.0.2"),
        council_url=os.getenv("COUNCIL_URL", "http://localhost:4000"),
        robot_id=os.getenv("ROBOT_ID", "panda-001"),
        api_key=os.getenv("COUNCIL_API_KEY", ""),
    )

    if not await client.connect():
        print("Failed to connect")
        return

    print("Panda connected to Council. Press Ctrl+C to exit.")

    try:
        while True:
            await asyncio.sleep(1.0)

            # Print periodic status
            stats = client.telemetry.get_stats()
            print(f"Telemetry: {stats['frames_sent']} sent, {stats['frames_dropped']} dropped")

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
