export { defineConnector } from './define-connector.js';
export type {
  ConnectorContext,
  ConnectorDefinition,
  ConnectorManifest,
  ConnectorOperation,
  ConnectorTrust,
  ConnectorHttpClient,
  ConnectorConfigReader,
  ConnectorLogger,
  HttpResponse,
  HttpRequestOptions,
} from './types.js';

// Re-export zod for convenience so connector authors don't need a separate dependency
export { z } from 'zod';
