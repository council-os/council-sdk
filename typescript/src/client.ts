import { type Credentials, resolveCredentials } from "./auth.js";
import { AgentsNamespace } from "./namespaces/agents.js";
import { AuditNamespace } from "./namespaces/audit.js";
import { CommandNamespace } from "./namespaces/command.js";
import { ContainmentNamespace } from "./namespaces/containment.js";
import { FleetNamespace } from "./namespaces/fleet.js";
import { JuryNamespace } from "./namespaces/jury.js";
import { SafetyNamespace } from "./namespaces/safety.js";
import { SandboxNamespace } from "./namespaces/sandbox.js";
import { EventStream } from "./namespaces/streaming.js";
import { Transport } from "./transport.js";
import type { CouncilOptions, Workspace } from "./types.js";

/**
 * Client for the Council AI Governance Platform.
 *
 * @example
 * ```typescript
 * // From environment variables
 * const client = new Council();
 *
 * // Explicit credentials
 * const client = new Council({ apiKey: 'ck_live_...', baseUrl: 'https://council.example.com' });
 *
 * // Access namespaces
 * const agent = await client.agents.register({ workspaceId: 'ws_abc', name: 'Bot' });
 * const verdict = await client.jury.deliberate({ action: 'deploy', context: {} });
 * ```
 */
export class Council {
  private credentials: Credentials;
  private transport: Transport;

  /** Agent registration & lifecycle management. */
  public readonly agents: AgentsNamespace;
  /** Jury deliberation & verdicts. */
  public readonly jury: JuryNamespace;
  /** Sandboxed code execution. */
  public readonly sandbox: SandboxNamespace;
  /** Audit logs & blockchain verification. */
  public readonly audit: AuditNamespace;
  /** Emergency halt, escalation management & watchdog. */
  public readonly safety: SafetyNamespace;
  /** Fleet-level safety intelligence & dashboard. */
  public readonly fleet: FleetNamespace;
  /** AGP Command operations — agent registration, governance, deployments & fleets. */
  public readonly command: CommandNamespace;
  /** Containment cascade, replay, quarantine & threat signatures (WS5). */
  public readonly containment: ContainmentNamespace;

  constructor(options: CouncilOptions = {}) {
    this.credentials = resolveCredentials({
      apiKey: options.apiKey,
      jwtToken: options.jwtToken,
      baseUrl: options.baseUrl,
    });

    this.transport = new Transport(this.credentials, {
      timeout: options.timeout,
      fetch: options.fetch,
    });

    this.agents = new AgentsNamespace(this.transport);
    this.command = new CommandNamespace(this.transport);
    this.jury = new JuryNamespace(this.transport);
    this.sandbox = new SandboxNamespace(this.transport);
    this.audit = new AuditNamespace(this.transport);
    this.safety = new SafetyNamespace(this.transport);
    this.fleet = new FleetNamespace(this.transport);
    this.containment = new ContainmentNamespace(this.transport);
  }

  /**
   * Create a client from ~/.council/config.json.
   */
  static async fromConfig(
    profile = "default",
    options: Omit<CouncilOptions, "apiKey" | "jwtToken" | "baseUrl"> = {},
  ): Promise<Council> {
    const creds = resolveCredentials({ profile });
    return new Council({
      apiKey: creds.apiKey,
      jwtToken: creds.jwtToken,
      baseUrl: creds.baseUrl,
      ...options,
    });
  }

  // ── Auth convenience ───────────────────────────────────────────────────

  /**
   * Authenticate with email/password and store the resulting tokens.
   */
  async login(options: {
    email: string;
    password: string;
  }): Promise<Record<string, unknown>> {
    const resp = await this.transport.post("/api/auth/login", {
      json: { email: options.email, password: options.password },
    });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    if (data.accessToken) {
      this.transport.updateAuth(
        data.accessToken as string,
        data.refreshToken as string | undefined,
      );
    }
    return data;
  }

  /**
   * Register a new user account.
   */
  async register(options: {
    email: string;
    password: string;
    name: string;
  }): Promise<Record<string, unknown>> {
    const resp = await this.transport.post("/api/auth/register", {
      json: options,
    });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    if (data.accessToken) {
      this.transport.updateAuth(
        data.accessToken as string,
        data.refreshToken as string | undefined,
      );
    }
    return data;
  }

  /**
   * Refresh the access token.
   */
  async refreshToken(refreshToken?: string): Promise<Record<string, unknown>> {
    const token = refreshToken ?? this.credentials.refreshToken;
    const body: Record<string, unknown> = {};
    if (token) body.refreshToken = token;

    const resp = await this.transport.post("/api/auth/refresh", { json: body });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    if (data.accessToken) {
      this.transport.updateAuth(
        data.accessToken as string,
        data.refreshToken as string | undefined,
      );
    }
    return data;
  }

  /**
   * Get the current authenticated user.
   */
  async me(): Promise<Record<string, unknown>> {
    const resp = await this.transport.get("/api/auth/me");
    return (resp.data ?? resp) as Record<string, unknown>;
  }

  /**
   * Logout and invalidate the current tokens.
   */
  async logout(): Promise<void> {
    const body: Record<string, unknown> = {};
    if (this.credentials.refreshToken) {
      body.refreshToken = this.credentials.refreshToken;
    }
    await this.transport.post("/api/auth/logout", { json: body });
    this.credentials.accessToken = undefined;
    this.credentials.refreshToken = undefined;
  }

  // ── Workspace convenience ──────────────────────────────────────────────

  /**
   * Create a new workspace.
   */
  async createWorkspace(options: {
    name: string;
    description?: string;
  }): Promise<Workspace> {
    const body: Record<string, unknown> = { name: options.name };
    if (options.description) body.description = options.description;

    const resp = await this.transport.post("/api/workspaces", { json: body });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    return parseWorkspace(data);
  }

  /**
   * List all workspaces.
   */
  async listWorkspaces(): Promise<Workspace[]> {
    const resp = await this.transport.get("/api/workspaces");
    const data = resp.data;
    const items = Array.isArray(data) ? data : [data];
    return items.map((w) => parseWorkspace(w as Record<string, unknown>));
  }

  // ── Streaming ──────────────────────────────────────────────────────────

  /**
   * Create a WebSocket event stream for real-time updates.
   */
  stream(): EventStream {
    return new EventStream(this.credentials);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWorkspace(data: Record<string, unknown>): Workspace {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    description: data.description as string | undefined,
    ownerId: (data.ownerId ?? data.owner_id) as string | undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
    updatedAt: data.updatedAt ? new Date(data.updatedAt as string) : undefined,
  };
}
