import { Transport } from "../transport.js";

/**
 * Fleet-level safety intelligence — metrics, anomalies, collusion alerts,
 * and behavioural deviations.
 *
 * @example
 * ```typescript
 * // Get fleet health overview
 * const overview = await client.fleet.overview();
 *
 * // List recent anomalies
 * const anomalies = await client.fleet.anomalies({ hours: 4 });
 *
 * // Trigger full fleet analysis
 * const result = await client.fleet.analyse();
 *
 * // Get collusion alerts
 * const alerts = await client.fleet.collusionAlerts();
 *
 * // Trigger collusion scan
 * const scan = await client.fleet.collusionScan();
 *
 * // Get agent deviations
 * const deviations = await client.fleet.deviations();
 *
 * // Run safety invariant checks
 * const invariants = await client.fleet.invariants();
 * ```
 */
export class FleetNamespace {
  constructor(private transport: Transport) {}

  // ── Fleet Metrics ────────────────────────────────────────────────────

  /**
   * Current fleet-level health snapshot.
   */
  async metrics(): Promise<FleetMetrics> {
    const resp = await this.transport.get("/api/v1/safety/fleet/metrics");
    return (resp.data ?? resp) as FleetMetrics;
  }

  /**
   * Coordinated anomaly alerts.
   */
  async anomalies(
    options: { hours?: number } = {},
  ): Promise<FleetAnomaliesResponse> {
    const params: Record<string, unknown> = {};
    if (options.hours) params.hours = options.hours;

    const resp = await this.transport.get("/api/v1/safety/fleet/anomalies", {
      params,
    });
    return (resp.data ?? resp) as FleetAnomaliesResponse;
  }

  /**
   * Dangerous capability compositions across the fleet.
   */
  async capabilities(): Promise<CapabilityRiskResponse> {
    const resp = await this.transport.get("/api/v1/safety/fleet/capabilities");
    return (resp.data ?? resp) as CapabilityRiskResponse;
  }

  /**
   * Trigger a full fleet analysis (proxy relay + capability composition).
   */
  async analyse(): Promise<FleetAnalysisResult> {
    const resp = await this.transport.post("/api/v1/safety/fleet/analyse", {
      json: {},
    });
    return (resp.data ?? resp) as FleetAnalysisResult;
  }

  // ── Collusion Detection ──────────────────────────────────────────────

  /**
   * Get recent collusion alerts.
   */
  async collusionAlerts(
    options: { hours?: number } = {},
  ): Promise<CollusionAlertsResponse> {
    const params: Record<string, unknown> = {};
    if (options.hours) params.hours = options.hours;

    const resp = await this.transport.get("/api/v1/safety/collusion/alerts", {
      params,
    });
    return (resp.data ?? resp) as CollusionAlertsResponse;
  }

  /**
   * Trigger a full collusion scan.
   */
  async collusionScan(): Promise<CollusionScanResult> {
    const resp = await this.transport.post("/api/v1/safety/collusion/scan", {
      json: {},
    });
    return (resp.data ?? resp) as CollusionScanResult;
  }

  // ── Behavioural Profiling ────────────────────────────────────────────

  /**
   * Get agents with behavioural deviations from their baselines.
   */
  async deviations(): Promise<DeviationsResponse> {
    const resp = await this.transport.get("/api/v1/safety/agents/deviations");
    return (resp.data ?? resp) as DeviationsResponse;
  }

  /**
   * Get the agent communication graph.
   */
  async communicationGraph(): Promise<CommunicationGraphResponse> {
    const resp = await this.transport.get("/api/v1/safety/agents/graph");
    return (resp.data ?? resp) as CommunicationGraphResponse;
  }

  // ── Invariants ───────────────────────────────────────────────────────

  /**
   * Run all safety invariant checks.
   */
  async invariants(): Promise<InvariantCheckResponse> {
    const resp = await this.transport.get("/api/v1/safety/invariants");
    return (resp.data ?? resp) as InvariantCheckResponse;
  }

  // ── Overview ─────────────────────────────────────────────────────────

  /**
   * Combined dashboard overview — all metrics in a single call.
   */
  async overview(): Promise<DashboardOverview> {
    const resp = await this.transport.get("/api/v1/safety/overview");
    return (resp.data ?? resp) as DashboardOverview;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface FleetMetrics {
  totalRequestsPerMin: number;
  scopeElevationsPerHour: number;
  denialsPerHour: number;
  anomalousAgentCount: number;
  fleetRisk: "normal" | "elevated" | "critical";
  timestamp: string;
}

export interface CoordinatedAnomaly {
  type: string;
  description: string;
  involvedAgents: string[];
  detectedAt: string;
  severity: "warning" | "critical";
  details: Record<string, unknown>;
}

export interface FleetAnomaliesResponse {
  data: CoordinatedAnomaly[];
  total: number;
}

export interface CapabilityRisk {
  agents: string[];
  scopes: string[];
  combinedRisk: string;
  severity: "warning" | "critical";
}

export interface CapabilityRiskResponse {
  data: CapabilityRisk[];
  total: number;
}

export interface FleetAnalysisResult {
  message: string;
  newAnomalies: number;
  anomalies: CoordinatedAnomaly[];
}

export interface CollusionAlert {
  type: string;
  description: string;
  involvedAgents: string[];
  confidence: number;
  evidence: Record<string, unknown>;
  detectedAt: string;
  severity: "warning" | "critical";
}

export interface CollusionAlertsResponse {
  data: CollusionAlert[];
  total: number;
  summary: {
    totalAlerts: number;
    criticalAlerts: number;
    byType: Record<string, number>;
  };
}

export interface CollusionScanResult {
  message: string;
  newAlerts: number;
  alerts: CollusionAlert[];
}

export interface DeviationReport {
  agentId: string;
  deviations: {
    metric: string;
    currentValue: number;
    baselineMean: number;
    baselineStd: number;
    sigmas: number;
  }[];
  overallScore: number;
  timestamp: string;
}

export interface DeviationsResponse {
  data: DeviationReport[];
  total: number;
}

export interface CommunicationEdge {
  from: string;
  to: string;
  weight: number;
  lastSeen: number;
}

export interface CommunicationGraphResponse {
  data: CommunicationEdge[];
  edgeCount: number;
}

export interface InvariantViolation {
  invariant: string;
  description: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface InvariantCheckResponse {
  passed: boolean;
  violations: InvariantViolation[];
  checkedAt: string;
}

export interface DashboardOverview {
  fleet: FleetMetrics;
  anomalies: {
    recent: CoordinatedAnomaly[];
    total: number;
  };
  collusion: {
    totalAlerts: number;
    criticalAlerts: number;
    byType: Record<string, number>;
  };
  deviations: {
    flaggedAgents: number;
    topDeviations: DeviationReport[];
  };
  invariants: {
    passed: boolean | null;
    violationCount: number;
  };
  timestamp: string;
}
