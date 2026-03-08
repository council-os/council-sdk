# Council Robotics Python SDK

Python SDK for connecting robots to the Council AI platform. Enables AI agents to deliberate on and control physical robots with human oversight and correction capabilities.

## Features

- **WebSocket Communication**: Real-time bidirectional communication with Council platform
- **ROS2 Integration**: Seamless integration with ROS2 robotics ecosystem
- **Telemetry Streaming**: Stream sensor data, joint states, and camera feeds
- **Command Execution**: Receive and execute commands from AI agents
- **Human Corrections**: Capture operator corrections for RLHF training
- **Offline Recording**: Record sessions for later analysis and training

## Installation

```bash
pip install council-robotics

# With ROS2 support
pip install council-robotics[ros2]

# With development tools
pip install council-robotics[dev]
```

## Quick Start

### Basic Connection

```python
import asyncio
from council_robotics import CouncilRoboticsClient

async def main():
    # Create and connect client
    client = CouncilRoboticsClient(
        base_url="http://localhost:4000",
        api_key="your-api-key",
        robot_id="robot-001"
    )

    await client.connect()

    # Send telemetry
    await client.send_telemetry(
        joint_positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        battery_level=85.0
    )

    # Request scene analysis
    analysis = await client.analyze_scene(
        image_base64="...",
        task_context="Pick up the red cube"
    )

    # Generate execution plan
    plan = await client.generate_plan(
        goal="Pick up the red cube and place it in the bin",
        scene_analysis=analysis
    )

    await client.disconnect()

asyncio.run(main())
```

### ROS2 Integration

```python
import asyncio
from council_robotics import ROS2Bridge, ROS2Config

async def main():
    config = ROS2Config(
        council_url="http://localhost:4000",
        robot_id="ur5e-001",
        api_key="your-api-key",
        joint_state_topic="/joint_states",
        camera_topic="/camera/color/image_raw",
        telemetry_rate=20.0,
    )

    from council_robotics.ros2_bridge import run_bridge
    await run_bridge(config)

asyncio.run(main())
```

Or run as a ROS2 node:

```bash
ros2 run council_robotics ros2_bridge \
    --ros-args \
    -p council_url:="http://council.example.com:4000" \
    -p robot_id:="robot-001" \
    -p api_key:="your-api-key"
```

### Handling Commands

```python
from council_robotics import CouncilRoboticsClient

client = CouncilRoboticsClient(...)

# Register custom command handler
async def handle_pick(data):
    command = data.get("command", {})
    params = command.get("parameters", {})

    target_pose = params.get("pose")
    print(f"Picking object at {target_pose}")

    # Execute on your robot
    # ...

    # Report result
    await client.report_command_result(
        command_id=command["id"],
        success=True,
        result={"picked": True}
    )

client.on_message("command", handle_pick)
```

### Capturing Human Corrections

```python
from council_robotics import CorrectionCapture, CorrectionType

capture = CorrectionCapture(session_id="session-001")

# Capture a trajectory correction
await capture.capture(
    correction_type=CorrectionType.TRAJECTORY,
    original_value={"waypoints": [[0,0,0], [1,0,0]]},
    corrected_value={"waypoints": [[0,0,0], [0.5,0.2,0], [1,0,0]]},
    step_id="step-001",
    reason="Added intermediate waypoint to avoid obstacle"
)

# Export for RLHF training
rlhf_data = capture.export_for_rlhf()
capture.save_to_file()
```

## Telemetry Types

The SDK supports various telemetry types:

```python
from council_robotics.telemetry import TelemetryFrame, JointState, Pose, Wrench

# Create a complete telemetry frame
frame = TelemetryFrame(
    timestamp=time.time() * 1000,
    joint_state=JointState(
        names=["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"],
        positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        velocities=[0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ),
    end_effector_pose=Pose(
        x=0.5, y=0.0, z=0.5,
        qx=0.0, qy=0.707, qz=0.0, qw=0.707
    ),
    force_torque=Wrench(
        force_x=0.0, force_y=0.0, force_z=-5.0,
        torque_x=0.0, torque_y=0.0, torque_z=0.0
    ),
    battery_level=85.0,
)
```

## Command Types

```python
from council_robotics.commands import RobotCommand

# Joint space movement
cmd = RobotCommand.move_joints(
    positions=[0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
    duration=2.0
)

# Cartesian movement
cmd = RobotCommand.move_cartesian(
    x=0.5, y=0.0, z=0.5,
    qx=0.0, qy=0.707, qz=0.0, qw=0.707
)

# Gripper control
cmd = RobotCommand.gripper(action="close", force=10.0)

# Velocity command (mobile robots)
cmd = RobotCommand.velocity(linear_x=0.5, angular_z=0.1)

# Emergency stop
cmd = RobotCommand.stop()
```

## API Reference

### CouncilRoboticsClient

Main client for connecting to Council platform.

| Method                            | Description                     |
| --------------------------------- | ------------------------------- |
| `connect()`                       | Connect to Council platform     |
| `disconnect()`                    | Disconnect from platform        |
| `send_telemetry(...)`             | Send robot telemetry            |
| `send_camera_frame(frame_base64)` | Send camera image               |
| `report_command_result(...)`      | Report command execution result |
| `join_session(session_id)`        | Join a physical lab session     |
| `register_robot(...)`             | Register robot with platform    |
| `create_wallet(...)`              | Create robot wallet             |
| `analyze_scene(...)`              | Request vision analysis         |
| `generate_plan(...)`              | Request execution plan          |
| `on_message(type, handler)`       | Register message handler        |

### ROS2Bridge

ROS2 node for transparent integration.

| Parameter           | Default                   | Description         |
| ------------------- | ------------------------- | ------------------- |
| `council_url`       | `http://localhost:4000`   | Council server URL  |
| `robot_id`          | Required                  | Robot identifier    |
| `api_key`           | Required                  | API key for auth    |
| `joint_state_topic` | `/joint_states`           | Joint state topic   |
| `camera_topic`      | `/camera/color/image_raw` | Camera topic        |
| `telemetry_rate`    | `20.0`                    | Telemetry rate (Hz) |

### CorrectionCapture

Captures human corrections for RLHF.

| Method                 | Description               |
| ---------------------- | ------------------------- |
| `capture(...)`         | Capture a correction      |
| `get_corrections(...)` | Get captured corrections  |
| `get_statistics()`     | Get correction statistics |
| `export_for_rlhf()`    | Export in RLHF format     |
| `save_to_file(...)`    | Save to JSON file         |

## License

MIT License - See LICENSE for details.
