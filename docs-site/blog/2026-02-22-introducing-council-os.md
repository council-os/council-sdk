---
title: "Introducing Council OS — The Harness Engineering Platform for AI Agents"
authors: [council]
tags: [launch, harness-engineering, ai-safety, agents]
description: "Council OS is the operating system that makes AI agents reliable, governable, and safe at fleet scale. Open source SDKs, enterprise-grade safety, sub-millisecond governance."
---

AI agents are everywhere — and nobody is governing them.

The numbers tell the story. Multi-agent system inquiries surged 1,445% between Q1 2024 and Q2 2025. The AI agent market, valued at $7.5 billion in 2025, is projected to reach $52.6 billion by 2030. Gartner estimates 40% of enterprise applications will embed AI agents by end of 2026, up from less than 5% in 2025. Salesforce projects multi-agent adoption will surge 67% by 2027.

Yet only 23% of enterprises are actually scaling agents in production. Another 39% are stuck in experimentation, unable to move past proof-of-concept. Why?

Because the infrastructure between AI models and the real world does not exist yet.

<!-- truncate -->

Today's orchestration frameworks help you *build* agents. They give you prompt templates, chain abstractions, and tool-calling patterns. But building an agent is not the hard part. The hard part is deploying a hundred agents that can act autonomously — sending emails, executing payments, modifying infrastructure — while remaining safe, auditable, and compliant. No framework solves that. The gap between "works in a notebook" and "trusted in production at fleet scale" is where organizations stall.

Council OS fills that gap. Today, we are making it available to developers and enterprises.

## Harness Engineering: A New Discipline

We call this discipline **harness engineering** — building the infrastructure layer between AI agents and the real world. The metaphor is deliberate. A harness does not slow down the horse; it channels its power safely. The same principle applies to AI agents.

The harness is the bottleneck. If your safety checks take 50 milliseconds, every agent action waits 50 milliseconds. If your governance layer adds 200ms of latency, your agent fleet moves at human speed, not machine speed. The harness must be fast enough to be invisible.

Council OS is the harness engineering platform. It is not a wrapper around large language models. It is not a prompt framework. It is the operating system that makes AI agents reliable, governable, and safe at fleet scale — with safety checks that run at the speed of the models themselves.

## Four Layers, One Platform

Council OS is organized into four layers, each addressing a fundamental requirement for production AI agent deployments.

### Do Things — Connector Architecture

Agents need to interact with the real world. Council OS ships with 39 built-in connectors covering the systems enterprises actually use: Slack, GitHub, Stripe, Notion, Kubernetes, CRM, PostHog, Linear, Jira, Sentry, AWS S3, Twilio, Shopify, DocuSign, and more — plus device and industrial connectors for OPC-UA, Modbus, MQTT, and robotics.

Every connector exposes a unified `namespace:operation` interface, so agent code does not change when you swap providers. Need a custom integration? The Connector SDK (available in TypeScript and Python) lets you build and register new connectors that plug into the same governance pipeline as built-in ones.

### Work Together — Agent Gateway Protocol

The Agent Gateway Protocol (AGP) is how agents communicate, coordinate, and execute tasks as composable fleets. AGP covers 10 domains with 50+ operations — from task delegation and status reporting to trust negotiation and escalation.

Every message flows through the gateway, where trust-scored governance routing determines what each agent can do. Agents are assigned roles with explicit tool permissions and operational limits. Fleet templates provide pre-composed agent teams (e.g., a startup operations fleet or an engineering fleet) that can be deployed in minutes with safety boundaries built in.

### Stay Safe — Safety Lattice

Safety is not a feature you bolt on. Council's Safety Lattice provides defense-in-depth across six workstreams (WS0 through WS5):

- **Emergency halts** that propagate across an entire fleet in under 100 milliseconds
- **Containment cascades** that isolate compromised agents before they can cause lateral damage
- **Fleet-level collusion detection** that catches coordinated manipulation — salami slicing, relay attacks, mutual-approve schemes
- **Runtime invariants** that enforce hard boundaries no agent can cross
- **Immune memory** that learns from past incidents so the same attack pattern never works twice
- **Multi-agent jury deliberation** for high-stakes decisions that require consensus before execution

### Go Fast — Native Core

Governance at fleet scale demands native performance. Council's core safety monitors are written in Rust, compiled via napi-rs, and deliver sub-millisecond latency: 20 out of 22 safety checks run under 1ms at p99, with the composite hot path (trust evaluation, governance routing, fleet monitoring, collusion detection, behavioral profiling, and ledger recording) completing in 40 microseconds at p99.

The Go-based AGP gateway handles 100K+ concurrent agent connections with token-bucket rate limiting and mTLS ingress. And every safety-relevant action is recorded in a Merkle safety ledger — a tamper-evident, SHA-256 hash-chained audit trail that provides cryptographic proof of what every agent did, when, and under what governance context.

## For Developers: Open Source SDKs

Council OS provides open source SDKs in TypeScript and Python. Install and integrate in minutes:

```typescript
import { Council } from '@council/sdk';

const council = new Council();
const agent = await council.agents.register({
  workspaceId: 'ws_abc',
  name: 'ResearchBot',
  model: 'claude-3-opus',
  capabilities: ['web_search', 'code_execution'],
});

const result = await council.agents.execute(agent.id, {
  action: 'analyze',
  context: { query: 'market trends' },
});
```

Governance, trust, tool routing, and operational limits are handled by the platform. Your agent code focuses on what the agent *does*, not on how to keep it safe. Build custom connectors with the Connector SDK. Integrate via AGP. Ship agents that are production-ready from day one.

## For Enterprise: Fleet Intelligence and Compliance

Council OS was built for organizations that need to deploy AI agents at scale with full accountability.

**Fleet intelligence** gives you real-time visibility into agent behavior across your entire organization. Anomaly detection, collusion analysis, and behavioral profiling surface risks before they become incidents.

**Cryptographic audit trail.** The Merkle safety ledger records every safety-relevant event in a tamper-evident hash chain. Auditors can independently verify that no records have been altered or deleted — without trusting the platform itself.

**Trust attestation certificates** are Ed25519-signed, machine-verifiable documents that attest to an agent's identity, capabilities, and governance compliance. They enable zero-trust agent-to-agent communication and federated trust across organizational boundaries.

**Sub-millisecond safety checks.** The composite governance hot path completes in 40 microseconds at p99. Safety does not slow your agents down.

**EU AI Act readiness.** Full enforcement begins August 2026, with fines up to 35 million EUR or 7% of global revenue. Council OS provides the technical controls — auditability, human oversight, risk management, transparency — that the regulation demands. The NIST RFI on AI Agent Security (January 2026) signals that similar frameworks are coming in the US.

Deploy self-hosted via Docker Compose or as a managed service. For highest-security environments, Council offers a hardware appliance with HSM integration (PKCS#11) and a physical kill switch.

## Get Started

Council OS is available today.

- **TypeScript**: `npm install @council/sdk`
- **Python**: `pip install council-sdk`
- **Documentation**: [docs.meetcouncil.com](https://docs.meetcouncil.com)
- **Source**: [github.com/council-os](https://github.com/council-os)
- **Enterprise inquiries**: [hello@meetcouncil.com](mailto:hello@meetcouncil.com)

Council OS was built because the AI agent revolution should not have to wait for the governance infrastructure to catch up. The models are ready. The use cases are clear. The missing piece was the harness — and now it exists.

Welcome to harness engineering. Welcome to Council OS.
