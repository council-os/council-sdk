#!/usr/bin/env python3
"""
Universal Robots UR5e Integration Example

This example demonstrates connecting a UR5e robot to the Council platform
using the Council Robotics SDK with ROS2.

Requirements:
- ROS2 Humble or later
- Universal Robots ROS2 Driver
- council-robotics[ros2]

Setup:
1. Launch UR5e driver: ros2 launch ur_robot_driver ur_control.launch.py
2. Configure Council connection
3. Run this script
"""

import asyncio
import os
import sys

# Add parent directory to path for local development
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from council_robotics import CouncilRoboticsClient, CorrectionCapture, CorrectionType
from council_robotics.ros2_bridge import ROS2Bridge, ROS2Config, HAS_ROS2

if not HAS_ROS2:
    print("ROS2 not available. Install rclpy and required packages.")
    print("For non-ROS usage, see basic_connection.py example.")
    sys.exit(1)

import rclpy
from rclpy.executors import MultiThreadedExecutor


class UR5eCouncilBridge(ROS2Bridge):
    """
    Extended ROS2 Bridge for UR5e-specific functionality.
    """

    def __init__(self, config: ROS2Config):
        super().__init__(config, node_name="ur5e_council_bridge")

        # UR5e-specific settings
        self.joint_names = [
            "shoulder_pan_joint",
            "shoulder_lift_joint",
            "elbow_joint",
            "wrist_1_joint",
            "wrist_2_joint",
            "wrist_3_joint",
        ]

        # Home position for UR5e
        self.home_position = [0.0, -1.57, 1.57, -1.57, -1.57, 0.0]

        # Correction capture for RLHF
        self.correction_capture = CorrectionCapture(
            session_id=f"ur5e_{self.config.robot_id}"
        )

        self.get_logger().info("UR5e Council Bridge initialized")

    async def _handle_move_joints(self, params):
        """Override for UR5e-specific joint control."""
        target_positions = params.get("positions", [])
        duration = params.get("duration", 2.0)

        # Validate joint count
        if len(target_positions) != 6:
            raise ValueError(f"UR5e requires 6 joint positions, got {len(target_positions)}")

        # Validate joint limits (simplified)
        for i, pos in enumerate(target_positions):
            if abs(pos) > 6.28:  # ~2*pi
                raise ValueError(f"Joint {i} position {pos} exceeds limits")

        # Use parent implementation for trajectory execution
        return await super()._handle_move_joints({
            "positions": target_positions,
            "duration": duration,
            "joint_names": self.joint_names,
        })

    async def _handle_gripper(self, params):
        """Handle Robotiq gripper commands."""
        action = params.get("action", "close")
        position = params.get("position", 0.0)

        # Robotiq gripper range: 0-255 (closed to open)
        if action == "open":
            gripper_pos = 255
        elif action == "close":
            gripper_pos = 0
        else:
            gripper_pos = int(position * 255)

        self.get_logger().info(f"Robotiq gripper: {action} (pos: {gripper_pos})")

        # Publish to gripper topic (depends on your setup)
        # self.gripper_pub.publish(...)

        return {"status": "gripper_commanded", "position": gripper_pos}

    async def go_home(self):
        """Move to home position."""
        self.get_logger().info("Moving to home position...")
        return await self._handle_move_joints({
            "positions": self.home_position,
            "duration": 3.0,
        })

    async def capture_correction(
        self,
        original_trajectory: list,
        corrected_trajectory: list,
        reason: str,
    ):
        """Capture operator correction."""
        await self.correction_capture.capture(
            correction_type=CorrectionType.TRAJECTORY,
            original_value={"trajectory": original_trajectory},
            corrected_value={"trajectory": corrected_trajectory},
            reason=reason,
            robot_state={"joint_positions": list(self._joint_state.position) if self._joint_state else None},
        )


async def main():
    """Main entry point."""
    # Configuration
    config = ROS2Config(
        council_url=os.getenv("COUNCIL_URL", "http://localhost:4000"),
        robot_id=os.getenv("ROBOT_ID", "ur5e-001"),
        api_key=os.getenv("COUNCIL_API_KEY", ""),

        # UR5e topics
        joint_state_topic="/joint_states",
        camera_topic="/camera/color/image_raw",
        end_effector_topic="/tool0_controller/current_pose",
        force_torque_topic="/force_torque_sensor_controller/wrench",

        # Trajectory controller
        trajectory_topic="/scaled_joint_trajectory_controller/joint_trajectory",

        # Rates
        telemetry_rate=50.0,  # UR robots can handle high rates
        camera_rate=10.0,
    )

    # Initialize ROS2
    rclpy.init()

    # Create bridge
    bridge = UR5eCouncilBridge(config)

    # Connect to Council
    connected = await bridge.connect_to_council()
    if not connected:
        bridge.get_logger().error("Failed to connect to Council")
        bridge.destroy_node()
        rclpy.shutdown()
        return

    # Register custom message handlers
    bridge.council_client.on_message("go_home", lambda _: asyncio.create_task(bridge.go_home()))

    # Create executor for spinning
    executor = MultiThreadedExecutor()
    executor.add_node(bridge)

    try:
        bridge.get_logger().info("UR5e Council Bridge running. Press Ctrl+C to exit.")

        # Spin in background thread
        import threading
        spin_thread = threading.Thread(target=executor.spin, daemon=True)
        spin_thread.start()

        # Keep main thread alive
        while rclpy.ok():
            await asyncio.sleep(1.0)

    except KeyboardInterrupt:
        bridge.get_logger().info("Shutting down...")
    finally:
        # Save corrections
        bridge.correction_capture.save_to_file()

        # Disconnect
        await bridge.disconnect_from_council()
        bridge.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
