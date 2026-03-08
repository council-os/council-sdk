import { describe, expect, it, vi } from "vitest";
import { Council } from "../src/client.js";
import type {
  ComplianceReport,
  FederationThreatSignature,
  GovernanceStats,
  PublicKeyInfo,
  TrustCertificate,
  TrustRoot,
  VerifyTrustCertResult,
} from "../src/types.js";

// ── Test Helpers ─────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

function createMockClient(responseData: unknown): {
  client: Council;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];

  const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
    captured.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });

    return {
      ok: true,
      status: 200,
      json: async () => responseData,
    } as Response;
  });

  const client = new Council({
    apiKey: "ck_test_key",
    baseUrl: "http://localhost:3001",
    fetch: mockFetch,
  });

  return { client, captured };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TRUST_CERT: TrustCertificate = {
  id: "cert_001",
  agentId: "agent_abc",
  orgId: "org_xyz",
  trustDimensions: {
    provenance: 0.9,
    code: 0.85,
    hardware: 0.95,
    network: 0.8,
    behavioral: 0.88,
  },
  compositeTrust: 0.876,
  governanceSummary: {
    totalActions: 500,
    autoApproved: 400,
    juryReviewed: 80,
    denied: 15,
    halts: 5,
  },
  issuedAt: "2026-02-19T00:00:00Z",
  expiresAt: "2026-02-20T00:00:00Z",
  signature: "sig_abc123",
  merkleProof: {
    leaf: "leaf_hash",
    root: "root_hash",
    index: 42,
    siblings: ["sib_a", "sib_b"],
  },
  signedTreeHead: {
    treeSize: 100,
    rootHash: "root_hash",
    signature: "sth_sig",
    timestamp: "2026-02-19T00:00:00Z",
  },
};

const TRUST_ROOT: TrustRoot = {
  id: "root_001",
  orgId: "org_partner",
  publicKey: "-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----",
  label: "Partner Org",
  addedAt: "2026-02-19T00:00:00Z",
};

const THREAT_SIG: FederationThreatSignature = {
  id: "sig_001",
  category: "prompt_injection",
  pattern: "ignore.*instructions",
  severity: "high",
  sourceOrgId: "org_partner",
  createdAt: "2026-02-19T00:00:00Z",
};

const GOV_STATS: GovernanceStats = {
  totalActions: 1000,
  autoApproved: 800,
  juryReviewed: 150,
  denied: 30,
  halts: 10,
  escalations: 10,
  averageTrust: 0.82,
};

const COMPLIANCE_REPORT: ComplianceReport = {
  startMs: 1708300800000,
  endMs: 1708387200000,
  stats: GOV_STATS,
  trustDistribution: { "0.7-0.8": 5, "0.8-0.9": 10, "0.9-1.0": 3 },
  topViolations: [
    { type: "scope_escalation", count: 12, severity: "high" },
  ],
  generatedAt: "2026-02-19T12:00:00Z",
};

// ── Trust Certificate Tests ─────────────────────────────────────────────────

describe("SafetyNamespace — Trust Certificates", () => {
  it("issueTrustCert sends POST to /api/v1/safety/trust-certs", async () => {
    const { client, captured } = createMockClient(TRUST_CERT);

    const result = await client.safety.issueTrustCert({
      agentId: "agent_abc",
      orgId: "org_xyz",
      trustDimensions: {
        provenance: 0.9,
        code: 0.85,
        hardware: 0.95,
        network: 0.8,
        behavioral: 0.88,
      },
      governanceSummary: {
        totalActions: 500,
        autoApproved: 400,
        juryReviewed: 80,
        denied: 15,
        halts: 5,
      },
      validityHours: 24,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toContain("/api/v1/safety/trust-certs");
    expect(captured[0].body).toHaveProperty("agentId", "agent_abc");
    expect(captured[0].body).toHaveProperty("orgId", "org_xyz");
    expect(captured[0].body).toHaveProperty("trustDimensions");
    expect(captured[0].body).toHaveProperty("governanceSummary");
    expect(captured[0].body).toHaveProperty("validityHours", 24);
    expect(result.id).toBe("cert_001");
    expect(result.compositeTrust).toBe(0.876);
    expect(result.signature).toBe("sig_abc123");
  });

  it("getTrustCerts sends GET to /api/v1/safety/trust-certs/:agentId", async () => {
    const { client, captured } = createMockClient([TRUST_CERT]);

    const result = await client.safety.getTrustCerts("agent_abc");

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/trust-certs/agent_abc");
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("agent_abc");
  });

  it("getTrustCerts handles wrapped response with certificates key", async () => {
    const { client } = createMockClient({
      data: { certificates: [TRUST_CERT] },
    });

    const result = await client.safety.getTrustCerts("agent_abc");
    expect(result).toHaveLength(1);
  });

  it("verifyTrustCert sends POST to /api/v1/safety/trust-certs/verify", async () => {
    const verifyResult: VerifyTrustCertResult = { valid: true };
    const { client, captured } = createMockClient(verifyResult);

    const result = await client.safety.verifyTrustCert(TRUST_CERT);

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toContain("/api/v1/safety/trust-certs/verify");
    expect(captured[0].body).toHaveProperty("id", "cert_001");
    expect(captured[0].body).toHaveProperty("signature", "sig_abc123");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("verifyTrustCert returns invalid with reason", async () => {
    const verifyResult: VerifyTrustCertResult = {
      valid: false,
      reason: "Certificate expired",
    };
    const { client } = createMockClient(verifyResult);

    const result = await client.safety.verifyTrustCert(TRUST_CERT);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Certificate expired");
  });

  it("getPublicKey sends GET to /api/v1/safety/trust-certs/public-key", async () => {
    const pkInfo: PublicKeyInfo = {
      publicKey: "-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----",
      algorithm: "Ed25519",
    };
    const { client, captured } = createMockClient(pkInfo);

    const result = await client.safety.getPublicKey();

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/trust-certs/public-key");
    expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(result.algorithm).toBe("Ed25519");
  });
});

// ── Federation Tests ─────────────────────────────────────────────────────────

describe("SafetyNamespace — Federation", () => {
  it("getTrustRoots sends GET to /api/v1/safety/federation/trust-roots", async () => {
    const { client, captured } = createMockClient([TRUST_ROOT]);

    const result = await client.safety.getTrustRoots();

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/federation/trust-roots");
    expect(result).toHaveLength(1);
    expect(result[0].orgId).toBe("org_partner");
    expect(result[0].label).toBe("Partner Org");
  });

  it("getTrustRoots handles wrapped response with roots key", async () => {
    const { client } = createMockClient({ data: { roots: [TRUST_ROOT] } });

    const result = await client.safety.getTrustRoots();
    expect(result).toHaveLength(1);
  });

  it("addTrustRoot sends POST to /api/v1/safety/federation/trust-roots", async () => {
    const { client, captured } = createMockClient(TRUST_ROOT);

    const result = await client.safety.addTrustRoot({
      orgId: "org_partner",
      publicKey: "-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----",
      label: "Partner Org",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toContain("/api/v1/safety/federation/trust-roots");
    expect(captured[0].body).toHaveProperty("orgId", "org_partner");
    expect(captured[0].body).toHaveProperty("label", "Partner Org");
    expect(captured[0].body).toHaveProperty("publicKey");
    expect(result.id).toBe("root_001");
  });

  it("getThreatSignatures sends GET to /api/v1/safety/federation/signatures", async () => {
    const { client, captured } = createMockClient([THREAT_SIG]);

    const result = await client.safety.getThreatSignatures();

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/federation/signatures");
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("prompt_injection");
  });

  it("getThreatSignatures passes category as query param", async () => {
    const { client, captured } = createMockClient([THREAT_SIG]);

    await client.safety.getThreatSignatures("prompt_injection");

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toContain("category=prompt_injection");
  });

  it("getThreatSignatures handles wrapped response with signatures key", async () => {
    const { client } = createMockClient({
      data: { signatures: [THREAT_SIG] },
    });

    const result = await client.safety.getThreatSignatures();
    expect(result).toHaveLength(1);
  });
});

// ── Compliance Tests ─────────────────────────────────────────────────────────

describe("SafetyNamespace — Compliance", () => {
  it("getGovernanceStats sends GET to /api/v1/safety/compliance/stats", async () => {
    const { client, captured } = createMockClient(GOV_STATS);

    const result = await client.safety.getGovernanceStats();

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/compliance/stats");
    expect(result.totalActions).toBe(1000);
    expect(result.autoApproved).toBe(800);
    expect(result.averageTrust).toBe(0.82);
  });

  it("getComplianceReport sends GET with start and end query params", async () => {
    const { client, captured } = createMockClient(COMPLIANCE_REPORT);

    const result = await client.safety.getComplianceReport(
      1708300800000,
      1708387200000,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toContain("/api/v1/safety/compliance/report");
    expect(captured[0].url).toContain("start=1708300800000");
    expect(captured[0].url).toContain("end=1708387200000");
    expect(result.stats.totalActions).toBe(1000);
    expect(result.topViolations).toHaveLength(1);
    expect(result.topViolations[0].type).toBe("scope_escalation");
  });
});

// ── Namespace Existence Tests ────────────────────────────────────────────────

describe("SafetyNamespace — method availability", () => {
  const client = new Council({
    apiKey: "test_key",
    baseUrl: "http://localhost:3001",
  });

  it("has trust certificate methods", () => {
    expect(typeof client.safety.issueTrustCert).toBe("function");
    expect(typeof client.safety.getTrustCerts).toBe("function");
    expect(typeof client.safety.verifyTrustCert).toBe("function");
    expect(typeof client.safety.getPublicKey).toBe("function");
  });

  it("has federation methods", () => {
    expect(typeof client.safety.getTrustRoots).toBe("function");
    expect(typeof client.safety.addTrustRoot).toBe("function");
    expect(typeof client.safety.getThreatSignatures).toBe("function");
  });

  it("has compliance methods", () => {
    expect(typeof client.safety.getGovernanceStats).toBe("function");
    expect(typeof client.safety.getComplianceReport).toBe("function");
  });

  it("retains existing halt methods", () => {
    expect(typeof client.safety.halt).toBe("function");
    expect(typeof client.safety.liftHalt).toBe("function");
    expect(typeof client.safety.status).toBe("function");
  });

  it("retains existing escalation methods", () => {
    expect(typeof client.safety.approveEscalation).toBe("function");
    expect(typeof client.safety.denyEscalation).toBe("function");
    expect(typeof client.safety.getEscalation).toBe("function");
  });

  it("retains watchdog method", () => {
    expect(typeof client.safety.acknowledgeWatchdog).toBe("function");
  });
});
