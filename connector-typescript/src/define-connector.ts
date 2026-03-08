import type { ConnectorDefinition } from './types.js';

/**
 * defineConnector — the single entry point for creating a Council connector.
 *
 * @example
 * ```typescript
 * import { defineConnector, z } from '@council/connector-sdk';
 *
 * export default defineConnector({
 *   name: 'my-api',
 *   version: '1.0.0',
 *   publisher: 'my-org',
 *   trust: 'community',
 *   configSchema: z.object({ apiKey: z.string() }),
 *   operations: {
 *     get_data: {
 *       description: 'Fetches data from my API',
 *       parameters: z.object({ query: z.string() }),
 *       returns: z.object({ results: z.array(z.string()) }),
 *       async handler(params, ctx) {
 *         const resp = await ctx.http.get(`https://api.example.com/search?q=${params.query}`, {
 *           headers: { Authorization: `Bearer ${ctx.config.getRequired('apiKey')}` },
 *         });
 *         return { results: resp.data as string[] };
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function defineConnector(definition: ConnectorDefinition): ConnectorDefinition {
  // Validate structure at definition time
  if (!definition.name || typeof definition.name !== 'string') {
    throw new Error('Connector name is required and must be a string');
  }
  if (!definition.version || typeof definition.version !== 'string') {
    throw new Error('Connector version is required and must be a string');
  }
  if (!definition.operations || Object.keys(definition.operations).length === 0) {
    throw new Error('Connector must have at least one operation');
  }

  for (const [opName, op] of Object.entries(definition.operations)) {
    if (!op.description) {
      throw new Error(`Operation "${opName}" must have a description`);
    }
    if (!op.parameters) {
      throw new Error(`Operation "${opName}" must have a parameters schema`);
    }
    if (!op.returns) {
      throw new Error(`Operation "${opName}" must have a returns schema`);
    }
    if (typeof op.handler !== 'function') {
      throw new Error(`Operation "${opName}" must have a handler function`);
    }
  }

  return definition;
}
