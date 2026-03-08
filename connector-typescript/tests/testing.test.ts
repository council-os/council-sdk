import { describe, it, expect } from 'vitest';
import { createTestContext } from '../src/testing';
import { defineConnector } from '../src/define-connector';
import { z } from 'zod';

describe('createTestContext', () => {
  it('provides config values', () => {
    const ctx = createTestContext({ config: { apiKey: 'sk-test' } });
    expect(ctx.config.get('apiKey')).toBe('sk-test');
    expect(ctx.config.get('missing')).toBeUndefined();
    expect(ctx.config.getRequired('apiKey')).toBe('sk-test');
  });

  it('getRequired throws on missing config', () => {
    const ctx = createTestContext({});
    expect(() => ctx.config.getRequired('missing')).toThrow('Missing required config');
  });

  it('mocks HTTP responses by URL pattern', async () => {
    const ctx = createTestContext({
      httpMock: {
        'https://api.example.com/*': { status: 200, body: { result: 'ok' } },
      },
    });

    const resp = await ctx.http.get('https://api.example.com/data');
    expect(resp.status).toBe(200);
    expect(resp.data).toEqual({ result: 'ok' });
  });

  it('returns 404 for unmatched URLs', async () => {
    const ctx = createTestContext({});
    const resp = await ctx.http.get('https://unknown.com/api');
    expect(resp.status).toBe(404);
  });

  it('tracks HTTP calls', async () => {
    const ctx = createTestContext({
      httpMock: { 'https://api.test.com/*': { status: 200, body: {} } },
    });

    await ctx.http.get('https://api.test.com/a');
    await ctx.http.post('https://api.test.com/b', { body: { x: 1 } });

    expect(ctx.http.calls).toHaveLength(2);
    expect(ctx.http.calls[0].method).toBe('GET');
    expect(ctx.http.calls[1].method).toBe('POST');
    expect(ctx.http.calls[1].body).toEqual({ x: 1 });
  });

  it('works end-to-end with a connector', async () => {
    const connector = defineConnector({
      name: 'weather',
      version: '1.0.0',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({ apiKey: z.string() }),
      operations: {
        get_forecast: {
          description: 'Get weather forecast',
          parameters: z.object({ city: z.string() }),
          returns: z.object({ temp: z.number(), condition: z.string() }),
          handler: async (params, ctx) => {
            const resp = await ctx.http.get(
              `https://weather.api/forecast?city=${params.city}`,
              { headers: { Authorization: `Bearer ${ctx.config.getRequired('apiKey')}` } },
            );
            const data = resp.data as any;
            return { temp: data.temp, condition: data.condition };
          },
        },
      },
    });

    const ctx = createTestContext({
      config: { apiKey: 'test-weather-key' },
      httpMock: {
        'https://weather.api/*': { status: 200, body: { temp: 72, condition: 'sunny' } },
      },
    });

    const result = await connector.operations.get_forecast.handler({ city: 'SF' }, ctx);
    expect(result.temp).toBe(72);
    expect(result.condition).toBe('sunny');
    expect(ctx.http.calls).toHaveLength(1);
    expect(ctx.http.calls[0].headers?.Authorization).toBe('Bearer test-weather-key');
  });
});
