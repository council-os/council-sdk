import { describe, it, expect } from 'vitest';
import { defineConnector } from '../src/define-connector';
import { z } from 'zod';

describe('defineConnector', () => {
  it('returns the definition unchanged when valid', () => {
    const def = defineConnector({
      name: 'test',
      version: '1.0.0',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({}),
      operations: {
        hello: {
          description: 'Says hello',
          parameters: z.object({ name: z.string() }),
          returns: z.object({ greeting: z.string() }),
          handler: async (params) => ({ greeting: `Hi ${params.name}` }),
        },
      },
    });
    expect(def.name).toBe('test');
    expect(def.operations.hello).toBeDefined();
  });

  it('throws on missing name', () => {
    expect(() => defineConnector({
      name: '',
      version: '1.0.0',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({}),
      operations: { a: { description: 'x', parameters: z.object({}), returns: z.object({}), handler: async () => ({}) } },
    })).toThrow('Connector name is required');
  });

  it('throws on missing version', () => {
    expect(() => defineConnector({
      name: 'test',
      version: '',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({}),
      operations: { a: { description: 'x', parameters: z.object({}), returns: z.object({}), handler: async () => ({}) } },
    })).toThrow('Connector version is required');
  });

  it('throws on zero operations', () => {
    expect(() => defineConnector({
      name: 'test',
      version: '1.0.0',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({}),
      operations: {},
    })).toThrow('at least one operation');
  });

  it('throws on operation missing description', () => {
    expect(() => defineConnector({
      name: 'test',
      version: '1.0.0',
      publisher: 'council',
      trust: 'council',
      configSchema: z.object({}),
      operations: {
        bad: { description: '', parameters: z.object({}), returns: z.object({}), handler: async () => ({}) },
      },
    })).toThrow('must have a description');
  });
});
