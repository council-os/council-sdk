import { Credentials, buildHeaders } from "./auth.js";
import { CouncilError, NetworkError, raiseForStatus } from "./errors.js";

/**
 * Low-level HTTP transport for the Council SDK.
 */
export class Transport {
  private credentials: Credentials;
  private timeout: number;
  private customFetch: typeof globalThis.fetch;

  constructor(
    credentials: Credentials,
    options: {
      timeout?: number;
      fetch?: typeof globalThis.fetch;
    } = {},
  ) {
    this.credentials = credentials;
    this.timeout = options.timeout ?? 30_000;
    this.customFetch = options.fetch ?? globalThis.fetch;
  }

  get baseUrl(): string {
    return this.credentials.baseUrl;
  }

  updateAuth(accessToken: string, refreshToken?: string): void {
    this.credentials.accessToken = accessToken;
    if (refreshToken) {
      this.credentials.refreshToken = refreshToken;
    }
  }

  async request(
    method: string,
    path: string,
    options: {
      json?: Record<string, unknown>;
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Record<string, unknown>> {
    const url = new URL(path, this.credentials.baseUrl);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = {
      ...buildHeaders(this.credentials),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.customFetch(url.toString(), {
        method,
        headers,
        body: options.json ? JSON.stringify(options.json) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 204) {
        return {};
      }

      let body: Record<string, unknown>;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        if (response.ok) {
          return { data: await response.text() };
        }
        throw new CouncilError(`Non-JSON response (HTTP ${response.status})`, {
          statusCode: response.status,
        });
      }

      if (!response.ok) {
        raiseForStatus(response.status, body);
      }

      return body;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof CouncilError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError(`Request timed out after ${this.timeout}ms`);
      }

      throw new NetworkError(
        `Failed to connect to ${this.credentials.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async get(
    path: string,
    options?: {
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<Record<string, unknown>> {
    return this.request("GET", path, options);
  }

  async post(
    path: string,
    options?: {
      json?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<Record<string, unknown>> {
    return this.request("POST", path, options);
  }

  async put(
    path: string,
    options?: {
      json?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<Record<string, unknown>> {
    return this.request("PUT", path, options);
  }

  async delete(
    path: string,
    options?: { headers?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    return this.request("DELETE", path, options);
  }
}
