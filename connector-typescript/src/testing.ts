import type {
  ConnectorContext,
  ConnectorHttpClient,
  ConnectorConfigReader,
  ConnectorLogger,
  HttpResponse,
} from './types.js';

interface MockHttpRule {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface HttpCall {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TestHttpClient extends ConnectorHttpClient {
  /** All HTTP calls made during the test */
  calls: HttpCall[];
}

export interface CreateTestContextOptions {
  config?: Record<string, string>;
  httpMock?: Record<string, MockHttpRule>;
  agentId?: string;
  organizationId?: string;
}

function matchUrl(pattern: string, url: string): boolean {
  if (pattern === url) return true;
  if (pattern.endsWith('*')) {
    return url.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * Create a mock ConnectorContext for testing connectors without running Council.
 *
 * @example
 * ```typescript
 * const ctx = createTestContext({
 *   config: { apiKey: 'test-key' },
 *   httpMock: {
 *     'https://api.example.com/*': { status: 200, body: { data: 'test' } },
 *   },
 * });
 *
 * const result = await myConnector.operations.fetch_data.handler({ query: 'test' }, ctx);
 * expect(result.data).toBe('test');
 * expect(ctx.http.calls).toHaveLength(1);
 * ```
 */
export function createTestContext(options: CreateTestContextOptions = {}): ConnectorContext & { http: TestHttpClient } {
  const { config = {}, httpMock = {}, agentId = 'test-agent', organizationId = 'test-org' } = options;
  const calls: HttpCall[] = [];

  async function mockRequest(method: string, url: string, opts?: { headers?: Record<string, string>; body?: unknown }): Promise<HttpResponse> {
    calls.push({ method, url, headers: opts?.headers, body: opts?.body });

    // Find matching mock rule
    for (const [pattern, rule] of Object.entries(httpMock)) {
      if (matchUrl(pattern, url)) {
        return {
          status: rule.status,
          data: rule.body,
          headers: rule.headers ?? {},
        };
      }
    }

    // No mock rule — return 404
    return { status: 404, data: { error: `No mock for ${method} ${url}` }, headers: {} };
  }

  const http: TestHttpClient = {
    calls,
    request: (method, url, opts) => mockRequest(method, url, opts),
    get: (url, opts) => mockRequest('GET', url, opts),
    post: (url, opts) => mockRequest('POST', url, opts),
    put: (url, opts) => mockRequest('PUT', url, opts),
    delete: (url, opts) => mockRequest('DELETE', url, opts),
  };

  const configReader: ConnectorConfigReader = {
    get: (key) => config[key],
    getRequired: (key) => {
      const val = config[key];
      if (val === undefined) throw new Error(`Missing required config: ${key}`);
      return val;
    },
    getAll: () => ({ ...config }),
  };

  const log: ConnectorLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  return { http, config: configReader, log, agentId, organizationId };
}
