"""
ROS2 Bridge for Council Robotics

Provides seamless integration between ROS2 robots and the Council platform.
Handles translation between ROS2 messages and Council protocol.

Usage:
    ros2 run council_robotics ros2_bridge --ros-args -p robot_id:=robot-001
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

import numpy as np

# ROS2 imports (conditional to allow non-ROS usage)
try:
    import rclpy
    from rclpy.node import Node
    from rclpy.executors import MultiThreadedExecutor
    from rclpy.callback_groups import ReentrantCallbackGroup

    # Standard ROS2 message types
    from sensor_msgs.msg import JointState, Image, CameraInfo
    from geometry_msgs.msg import PoseStamped, Twist, WrenchStamped
    from std_msgs.msg import Float32, String, Bool
    from nav_msgs.msg import Odometry
    from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint
    from control_msgs.action import FollowJointTrajectory
    from moveit_msgs.msg import RobotState

    HAS_ROS2 = True
except ImportError:
    HAS_ROS2 = False
    Node = object

from .client import CouncilRoboticsClient

logger = logging.getLogger(__name__)


@dataclass
class ROS2Config:
    """ROS2 Bridge configuration."""

    # Council connection
    council_url: str = "http://localhost:4000"
    robot_id: str = ""
    api_key: str = ""

    # ROS2 topics
    joint_state_topic: str = "/joint_states"
    camera_topic: str = "/camera/color/image_raw"
    camera_info_topic: str = "/camera/color/camera_info"
    end_effector_topic: str = "/end_effector_pose"
    force_torque_topic: str = "/force_torque_sensor"
    cmd_vel_topic: str = "/cmd_vel"
    trajectory_topic: str = "/joint_trajectory_controller/joint_trajectory"

    # Frame IDs
    base_frame: str = "base_link"
    end_effector_frame: str = "tool0"

    # Publishing rates
    telemetry_rate: float = 20.0  # Hz
    camera_rate: float = 5.0  # Hz (lower to save bandwidth)


class ROS2Bridge(Node if HAS_ROS2 else object):
    """
    ROS2 Node that bridges to Council platform.

    Subscribes to robot state topics and publishes commands received from Council.
    Provides transparent integration between ROS2 ecosystem and AI agents.
    """

    def __init__(
        self,
        config: Optional[ROS2Config] = None,
        node_name: str = "council_robotics_bridge",
    ):
        if not HAS_ROS2:
            raise RuntimeError("ROS2 not available. Install rclpy and required packages.")

        super().__init__(node_name)

        # Load config from parameters
        self.config = config or self._load_config_from_params()

        # Council client
        self.council_client: Optional[CouncilRoboticsClient] = None

        # State storage
        self._joint_state: Optional[JointState] = None
        self._end_effector_pose: Optional[PoseStamped] = None
        self._force_torque: Optional[WrenchStamped] = None
        self._camera_frame: Optional[Image] = None

        # Command handlers
        self._command_handlers: Dict[str, Callable] = {}

        # Callback group for async operations
        self._callback_group = ReentrantCallbackGroup()

        # Create subscribers
        self._create_subscribers()

        # Create publishers
        self._create_publishers()

        # Create timers for periodic publishing
        self._create_timers()

        # Register command handlers
        self._register_command_handlers()

        self.get_logger().info("Council ROS2 Bridge initialized")

    def _load_config_from_params(self) -> ROS2Config:
        """Load configuration from ROS2 parameters."""
        self.declare_parameter("council_url", "http://localhost:4000")
        self.declare_parameter("robot_id", "")
        self.declare_parameter("api_key", "")
        self.declare_parameter("joint_state_topic", "/joint_states")
        self.declare_parameter("camera_topic", "/camera/color/image_raw")
        self.declare_parameter("telemetry_rate", 20.0)
        self.declare_parameter("camera_rate", 5.0)

        return ROS2Config(
            council_url=self.get_parameter("council_url").value,
            robot_id=self.get_parameter("robot_id").value,
            api_key=self.get_parameter("api_key").value,
            joint_state_topic=self.get_parameter("joint_state_topic").value,
            camera_topic=self.get_parameter("camera_topic").value,
            telemetry_rate=self.get_parameter("telemetry_rate").value,
            camera_rate=self.get_parameter("camera_rate").value,
        )

    def _create_subscribers(self):
        """Create ROS2 subscribers."""
        # Joint state
        self.joint_state_sub = self.create_subscription(
            JointState,
            self.config.joint_state_topic,
            self._joint_state_callback,
            10,
            callback_group=self._callback_group,
        )

        # Camera
        self.camera_sub = self.create_subscription(
            Image,
            self.config.camera_topic,
            self._camera_callback,
            10,
            callback_group=self._callback_group,
        )

        # End effector pose
        self.ee_pose_sub = self.create_subscription(
            PoseStamped,
            self.config.end_effector_topic,
            self._ee_pose_callback,
            10,
            callback_group=self._callback_group,
        )

        # Force torque
        self.ft_sub = self.create_subscription(
            WrenchStamped,
            self.config.force_torque_topic,
            self._force_torque_callback,
            10,
            callback_group=self._callback_group,
        )

    def _create_publishers(self):
        """Create ROS2 publishers."""
        # Velocity commands (mobile robots)
        self.cmd_vel_pub = self.create_publisher(
            Twist,
            self.config.cmd_vel_topic,
            10,
        )

        # Joint trajectory (manipulators)
        self.trajectory_pub = self.create_publisher(
            JointTrajectory,
            self.config.trajectory_topic,
            10,
        )

        # Status output
        self.status_pub = self.create_publisher(
            String,
            "/council/status",
            10,
        )

    def _create_timers(self):
        """Create periodic timers."""
        # Telemetry publishing timer
        telemetry_period = 1.0 / self.config.telemetry_rate
        self.telemetry_timer = self.create_timer(
            telemetry_period,
            self._publish_telemetry,
            callback_group=self._callback_group,
        )

        # Camera publishing timer (lower rate)
        camera_period = 1.0 / self.config.camera_rate
        self.camera_timer = self.create_timer(
            camera_period,
            self._publish_camera,
            callback_group=self._callback_group,
        )

    def _register_command_handlers(self):
        """Register handlers for Council commands."""
        self._command_handlers["move_joints"] = self._handle_move_joints
        self._command_handlers["move_cartesian"] = self._handle_move_cartesian
        self._command_handlers["gripper"] = self._handle_gripper
        self._command_handlers["velocity"] = self._handle_velocity
        self._command_handlers["custom"] = self._handle_custom

    # =========================================================================
    # ROS2 Callbacks
    # =========================================================================

    def _joint_state_callback(self, msg: "JointState"):
        """Handle joint state update."""
        self._joint_state = msg

    def _camera_callback(self, msg: "Image"):
        """Handle camera frame."""
        self._camera_frame = msg

    def _ee_pose_callback(self, msg: "PoseStamped"):
        """Handle end effector pose update."""
        self._end_effector_pose = msg

    def _force_torque_callback(self, msg: "WrenchStamped"):
        """Handle force/torque sensor update."""
        self._force_torque = msg

    # =========================================================================
    # Council Communication
    # =========================================================================

    async def connect_to_council(self):
        """Connect to Council platform."""
        self.council_client = CouncilRoboticsClient(
            base_url=self.config.council_url,
            api_key=self.config.api_key,
            robot_id=self.config.robot_id,
        )

        # Register command handler
        self.council_client.on_message("command", self._handle_council_command)

        # Connect
        success = await self.council_client.connect()
        if success:
            self.get_logger().info("Connected to Council platform")
            self._publish_status("Connected to Council")
        else:
            self.get_logger().error("Failed to connect to Council")
            self._publish_status("Council connection failed")

        return success

    async def disconnect_from_council(self):
        """Disconnect from Council platform."""
        if self.council_client:
            await self.council_client.disconnect()
            self.council_client = None

    def _publish_telemetry(self):
        """Publish telemetry to Council (timer callback)."""
        if not self.council_client or not self.council_client.state.authenticated:
            return

        # Build telemetry from current state
        telemetry_kwargs = {}

        if self._joint_state:
            telemetry_kwargs["joint_positions"] = list(self._joint_state.position)
            telemetry_kwargs["joint_velocities"] = list(self._joint_state.velocity)

        if self._end_effector_pose:
            pose = self._end_effector_pose.pose
            telemetry_kwargs["end_effector_pose"] = {
                "x": pose.position.x,
                "y": pose.position.y,
                "z": pose.position.z,
                "qx": pose.orientation.x,
                "qy": pose.orientation.y,
                "qz": pose.orientation.z,
                "qw": pose.orientation.w,
            }

        if self._force_torque:
            wrench = self._force_torque.wrench
            telemetry_kwargs["force_torque"] = [
                wrench.force.x, wrench.force.y, wrench.force.z,
                wrench.torque.x, wrench.torque.y, wrench.torque.z,
            ]

        # Send telemetry (fire and forget in timer context)
        asyncio.create_task(
            self.council_client.send_telemetry(**telemetry_kwargs)
        )

    def _publish_camera(self):
        """Publish camera frame to Council (timer callback)."""
        if not self.council_client or not self._camera_frame:
            return

        # Convert ROS Image to base64
        try:
            # Assuming RGB8 encoding
            image_data = np.array(self._camera_frame.data, dtype=np.uint8)
            image_data = image_data.reshape(
                (self._camera_frame.height, self._camera_frame.width, -1)
            )

            # Encode as JPEG for efficiency
            import cv2
            _, encoded = cv2.imencode(".jpg", image_data, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_base64 = base64.b64encode(encoded.tobytes()).decode()

            asyncio.create_task(
                self.council_client.send_camera_frame(frame_base64)
            )
        except Exception as e:
            self.get_logger().warn(f"Failed to encode camera frame: {e}")

    def _publish_status(self, status: str):
        """Publish status message."""
        msg = String()
        msg.data = status
        self.status_pub.publish(msg)

    # =========================================================================
    # Command Handlers
    # =========================================================================

    async def _handle_council_command(self, data: Dict[str, Any]):
        """Handle command received from Council."""
        command = data.get("command", {})
        cmd_type = command.get("type")
        cmd_id = command.get("id")
        parameters = command.get("parameters", {})

        self.get_logger().info(f"Received command: {cmd_type} ({cmd_id})")

        handler = self._command_handlers.get(cmd_type)
        if handler:
            try:
                result = await handler(parameters)
                await self.council_client.report_command_result(cmd_id, True, result)
            except Exception as e:
                self.get_logger().error(f"Command execution failed: {e}")
                await self.council_client.report_command_result(cmd_id, False, {"error": str(e)})
        else:
            self.get_logger().warn(f"Unknown command type: {cmd_type}")
            await self.council_client.report_command_result(
                cmd_id, False, {"error": f"Unknown command type: {cmd_type}"}
            )

    async def _handle_move_joints(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute joint space movement."""
        target_positions = params.get("positions", [])
        duration = params.get("duration", 2.0)
        joint_names = params.get("joint_names")

        # Use current joint names if not specified
        if not joint_names and self._joint_state:
            joint_names = list(self._joint_state.name)

        # Build trajectory message
        trajectory = JointTrajectory()
        trajectory.joint_names = joint_names

        point = JointTrajectoryPoint()
        point.positions = target_positions
        point.time_from_start.sec = int(duration)
        point.time_from_start.nanosec = int((duration % 1) * 1e9)

        trajectory.points.append(point)

        # Publish
        self.trajectory_pub.publish(trajectory)

        return {"status": "trajectory_sent", "joints": len(target_positions)}

    async def _handle_move_cartesian(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute Cartesian space movement."""
        # This would typically interface with MoveIt or similar
        target_pose = params.get("pose", {})

        self.get_logger().info(f"Cartesian move to: {target_pose}")

        # Implementation depends on robot controller
        # For now, log and return
        return {"status": "cartesian_move_requested", "pose": target_pose}

    async def _handle_gripper(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Control gripper."""
        action = params.get("action", "close")  # open, close, position
        position = params.get("position", 0.0)

        self.get_logger().info(f"Gripper: {action} (pos: {position})")

        # Implementation depends on gripper controller
        return {"status": "gripper_command_sent", "action": action}

    async def _handle_velocity(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send velocity command (mobile robots)."""
        linear = params.get("linear", {"x": 0, "y": 0, "z": 0})
        angular = params.get("angular", {"x": 0, "y": 0, "z": 0})

        cmd = Twist()
        cmd.linear.x = linear.get("x", 0)
        cmd.linear.y = linear.get("y", 0)
        cmd.linear.z = linear.get("z", 0)
        cmd.angular.x = angular.get("x", 0)
        cmd.angular.y = angular.get("y", 0)
        cmd.angular.z = angular.get("z", 0)

        self.cmd_vel_pub.publish(cmd)

        return {"status": "velocity_sent"}

    async def _handle_custom(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle custom commands from AI agents."""
        action = params.get("action", "unknown")
        self.get_logger().info(f"Custom action: {action}")

        # Extensible for custom robot behaviors
        return {"status": "custom_handled", "action": action}


async def run_bridge(config: Optional[ROS2Config] = None):
    """Run the ROS2 bridge node."""
    if not HAS_ROS2:
        raise RuntimeError("ROS2 not available")

    rclpy.init()

    bridge = ROS2Bridge(config)

    # Connect to Council
    await bridge.connect_to_council()

    # Spin in executor
    executor = MultiThreadedExecutor()
    executor.add_node(bridge)

    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        await bridge.disconnect_from_council()
        bridge.destroy_node()
        rclpy.shutdown()


def main():
    """Entry point for ROS2 launch."""
    asyncio.run(run_bridge())


if __name__ == "__main__":
    main()
