import type { z } from 'zod';

/** Trust levels for connectors. This determines execution runtime, NOT agent permissions. */
export type ConnectorTrust = 'council' | 'verified' | 'community';

/** HTTP response from ctx.http calls */
export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

/** Options for ctx.http requests */
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/** Audited HTTP client — all requests are logged and rate-limited */
export interface ConnectorHttpClient {
  request(method: string, url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  post(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  put(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

/** Configuration reader — reads org-scoped credentials */
export interface ConnectorConfigReader {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getAll(): Record<string, string>;
}

/** Logger available inside connector handlers */
export interface ConnectorLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Context injected into every connector operation handler.
 *
 * - `ctx.http` — audited HTTP client (no raw fetch/requests)
 * - `ctx.config` — org-scoped credential reader
 * - `ctx.log` — structured logger
 */
export interface ConnectorContext {
  http: ConnectorHttpClient;
  config: ConnectorConfigReader;
  log: ConnectorLogger;
  agentId: string;
  organizationId: string;
}

/** A single connector operation with typed parameters and return value */
export interface ConnectorOperation<TParams = any, TReturns = any> {
  description: string;
  parameters: z.ZodSchema<TParams>;
  returns: z.ZodSchema<TReturns>;
  handler: (params: TParams, ctx: ConnectorContext) => Promise<TReturns>;
}

/** Full connector definition — what defineConnector() returns */
export interface ConnectorDefinition {
  name: string;
  version: string;
  publisher: string;
  trust: ConnectorTrust;
  configSchema: z.ZodSchema;
  operations: Record<string, ConnectorOperation>;
}

/** Manifest extracted from a connector definition for registry use */
export interface ConnectorManifest {
  name: string;
  version: string;
  publisher: string;
  trust: ConnectorTrust;
  operations: string[];
  networkAllowlist?: string[];
  timeout?: number;
}
