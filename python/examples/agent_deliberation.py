#!/usr/bin/env python3
"""
Agent Deliberation Example

Demonstrates how AI agents in Council deliberate on robot actions
and how humans can intervene with corrections.

This is the key workflow for the Council platform:
1. Agent receives task and scene
2. Agent deliberates (thinking visible to humans)
3. Agent proposes action
4. Human approves or corrects
5. Robot executes
6. Corrections captured for RLHF training
"""

import asyncio
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from council_robotics import CouncilRoboticsClient, CorrectionCapture, CorrectionType


async def main():
    """Demonstrate agent deliberation workflow."""

    council_url = os.getenv("COUNCIL_URL", "http://localhost:4000")
    robot_id = os.getenv("ROBOT_ID", "demo-robot")
    api_key = os.getenv("COUNCIL_API_KEY", "")

    # Create client
    client = CouncilRoboticsClient(
        base_url=council_url,
        api_key=api_key,
        robot_id=robot_id,
    )

    # Correction capture for RLHF
    corrections = CorrectionCapture(session_id="demo-session")

    # Track agent deliberations
    agent_thoughts = []
    pending_decisions = {}

    # =========================================================================
    # Message Handlers
    # =========================================================================

    async def handle_agent_deliberation(data):
        """Handle agent's thinking process (visible to operators)."""
        agent_id = data.get("agentId", "unknown")
        thinking = data.get("thinking", "")

        print(f"\n🤔 Agent {agent_id} thinking:")
        print(f"   {thinking}")

        agent_thoughts.append({
            "agent_id": agent_id,
            "thinking": thinking,
            "timestamp": data.get("timestamp"),
        })

    async def handle_agent_decision(data):
        """Handle agent's proposed action."""
        agent_id = data.get("agentId", "unknown")
        decision = data.get("decision", {})

        print(f"\n💡 Agent {agent_id} proposes:")
        print(f"   Action: {decision.get('action')}")
        print(f"   Parameters: {json.dumps(decision.get('parameters', {}), indent=2)}")
        print(f"   Reasoning: {decision.get('reasoning')}")
        print(f"   Confidence: {decision.get('confidence', 0) * 100:.1f}%")

        if decision.get("requiresHumanApproval"):
            print("\n⚠️  This action requires human approval")
            pending_decisions[agent_id] = decision

            # In real implementation, this would trigger UI
            # For demo, auto-approve after delay
            await asyncio.sleep(2)

            print("   ✅ Auto-approved (in production, operator would review)")

    async def handle_approval_required(data):
        """Handle request for human approval."""
        agent_id = data.get("agentId", "unknown")
        decision = data.get("decision", {})

        print(f"\n🚨 APPROVAL REQUIRED from Agent {agent_id}")
        print(f"   Action: {decision.get('action')}")
        print(f"   Reason: {decision.get('reasoning')}")

        # Store for operator review
        pending_decisions[agent_id] = {
            "decision": decision,
            "timestamp": data.get("timestamp"),
        }

    # Register handlers
    client.on_message("agent_deliberation", handle_agent_deliberation)
    client.on_message("agent_decision", handle_agent_decision)
    client.on_message("approval_required", handle_approval_required)

    # =========================================================================
    # Connect and Demonstrate Workflow
    # =========================================================================

    if not await client.connect():
        print("Failed to connect")
        return

    print("✅ Connected to Council")
    print("\n" + "=" * 60)
    print("AGENT DELIBERATION WORKFLOW DEMO")
    print("=" * 60)

    # Simulate a task
    print("\n📋 Task: Pick up the red cube and place it in the bin")

    # Step 1: Analyze scene
    print("\n--- Step 1: Scene Analysis ---")

    # In production, you'd capture a real image
    fake_image = "base64_encoded_image_data"

    analysis = await client.analyze_scene(
        image_base64=fake_image,
        task_context="Pick up the red cube and place it in the bin"
    )

    if analysis:
        print(f"Scene Analysis:")
        print(f"  Objects detected: {analysis.get('objects', [])}")
        print(f"  Manipulation targets: {analysis.get('targets', [])}")
    else:
        print("  (Using simulated analysis)")
        analysis = {
            "objects": [
                {"label": "red_cube", "position": [0.3, 0.1, 0.02], "graspable": True},
                {"label": "blue_cube", "position": [0.4, 0.0, 0.02], "graspable": True},
                {"label": "bin", "position": [0.5, -0.2, 0.1], "graspable": False},
            ],
            "targets": ["red_cube", "bin"],
        }

    # Step 2: Generate plan
    print("\n--- Step 2: Plan Generation ---")

    plan = await client.generate_plan(
        goal="Pick up the red cube and place it in the bin",
        scene_analysis=analysis,
        constraints={
            "max_velocity": 0.5,
            "collision_avoidance": True,
        }
    )

    if plan:
        print(f"Generated Plan:")
        for i, step in enumerate(plan.get("steps", [])):
            print(f"  {i+1}. {step.get('action')}: {step.get('description')}")
    else:
        print("  (Using simulated plan)")
        plan = {
            "planId": "plan-001",
            "steps": [
                {"stepId": "s1", "action": "move_to_pregrasp", "description": "Move above red cube"},
                {"stepId": "s2", "action": "approach", "description": "Lower gripper to cube"},
                {"stepId": "s3", "action": "grasp", "description": "Close gripper on cube"},
                {"stepId": "s4", "action": "lift", "description": "Lift cube 10cm"},
                {"stepId": "s5", "action": "move_to_place", "description": "Move above bin"},
                {"stepId": "s6", "action": "release", "description": "Open gripper"},
            ]
        }
        for i, step in enumerate(plan["steps"]):
            print(f"  {i+1}. {step['action']}: {step['description']}")

    # Step 3: Simulate human correction
    print("\n--- Step 3: Human Correction ---")
    print("🔧 Operator reviews plan and makes corrections...")

    # Simulate operator adding a waypoint
    original_steps = plan.get("steps", [])
    corrected_steps = original_steps.copy()
    corrected_steps.insert(4, {
        "stepId": "s4b",
        "action": "move_via_waypoint",
        "description": "Move via safe waypoint to avoid obstacle",
    })

    print("\n   Original: 6 steps")
    print("   Corrected: 7 steps (added waypoint step)")

    # Capture correction for RLHF
    await corrections.capture(
        correction_type=CorrectionType.ADD,
        original_value={"steps": len(original_steps)},
        corrected_value={"steps": len(corrected_steps), "added_step": "move_via_waypoint"},
        step_id="s4",
        plan_id=plan.get("planId"),
        reason="Added intermediate waypoint to avoid collision with blue cube",
    )

    print("   ✅ Correction captured for RLHF training")

    # Step 4: Show execution (simulated)
    print("\n--- Step 4: Execution ---")

    for step in corrected_steps:
        print(f"   ▶️  Executing: {step['action']} - {step['description']}")
        await asyncio.sleep(0.5)

    print("\n   ✅ Task completed!")

    # Export RLHF data
    print("\n--- RLHF Export ---")
    rlhf_data = corrections.export_for_rlhf()
    print(f"   Corrections captured: {len(rlhf_data)}")

    # Save to file
    filename = corrections.save_to_file()
    print(f"   Saved to: {filename}")

    # Show statistics
    stats = corrections.get_statistics()
    print(f"\n   Session Statistics:")
    print(f"   - Total corrections: {stats['total_corrections']}")
    print(f"   - By type: {stats['by_type']}")

    await client.disconnect()
    print("\n✅ Workflow complete!")


if __name__ == "__main__":
    asyncio.run(main())
