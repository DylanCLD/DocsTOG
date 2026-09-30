import { createHash, timingSafeEqual } from "node:crypto";

// The MCP endpoint is off unless MCP_TOKEN is set, and a short token is refused:
// it protects read access to every page and document, so it must be unguessable.
export const MIN_TOKEN_LENGTH = 32;

export type McpAuthResult = { ok: true } | { ok: false; status: 401 | 503; message: string };

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** Compares two strings in constant time, whatever their lengths. */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

export function authenticateMcpRequest(authorization: string | null, expectedToken: string | undefined): McpAuthResult {
  if (!expectedToken || expectedToken.length < MIN_TOKEN_LENGTH) {
    return { ok: false, status: 503, message: "The MCP endpoint is not configured." };
  }

  const presented = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "")?.[1];
  if (!presented || !safeEqual(presented, expectedToken)) {
    return { ok: false, status: 401, message: "Invalid or missing bearer token." };
  }

  return { ok: true };
}
