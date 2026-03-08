import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Credentials {
  apiKey?: string;
  jwtToken?: string;
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ResolveOptions {
  apiKey?: string;
  jwtToken?: string;
  baseUrl?: string;
  profile?: string;
}

/**
 * Resolve credentials following the priority chain:
 * 1. Explicit parameters (highest)
 * 2. Environment variables
 * 3. Config file (~/.council/config.json)
 */
export function resolveCredentials(options: ResolveOptions = {}): Credentials {
  let apiKey = options.apiKey;
  let jwtToken = options.jwtToken;
  let baseUrl = options.baseUrl;

  // 2. Fill from environment
  if (!apiKey) apiKey = process.env.COUNCIL_API_KEY;
  if (!jwtToken) jwtToken = process.env.COUNCIL_JWT_TOKEN;
  if (!baseUrl) baseUrl = process.env.COUNCIL_BASE_URL;

  // 3. Fill from config file
  const config = loadConfig(options.profile ?? "default");
  if (config) {
    if (!apiKey) apiKey = config.api_key;
    if (!baseUrl) baseUrl = config.base_url;
  }

  return {
    apiKey,
    jwtToken,
    baseUrl: baseUrl ?? "http://localhost:3001",
  };
}

function loadConfig(profile: string): Record<string, string> | null {
  try {
    const configPath = join(homedir(), ".council", "config.json");
    const raw = readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    return data[profile] ?? data.default ?? null;
  } catch {
    return null;
  }
}

/** Build headers from credentials. */
export function buildHeaders(credentials: Credentials): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "council-sdk-typescript/1.0.0",
  };

  if (credentials.accessToken) {
    headers["Authorization"] = `Bearer ${credentials.accessToken}`;
  } else if (credentials.jwtToken) {
    headers["Authorization"] = `Bearer ${credentials.jwtToken}`;
  } else if (credentials.apiKey) {
    headers["Authorization"] = `Bearer ${credentials.apiKey}`;
  }

  return headers;
}
