import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { handleMcpPayload, SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/protocol";
import { createDocsTogServer } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Read-only MCP endpoint (Streamable HTTP, stateless JSON responses).
// It is off unless MCP_TOKEN is set. proxy.ts skips /api routes, so this handler does its own
// authentication and must refuse every request that does not carry the bearer token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 256 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const server = createDocsTogServer(createAdminClient);

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function rpcError(status: number, code: number, message: string) {
  return json(status, { jsonrpc: "2.0", id: null, error: { code, message } });
}

export async function POST(request: Request) {
  const auth = authenticateMcpRequest(request.headers.get("authorization"), process.env.MCP_TOKEN);
  if (!auth.ok) {
    return json(
      auth.status,
      { error: auth.message },
      auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="docstog-mcp"' } : {}
    );
  }

  // Sent by clients after the handshake; a value we did not negotiate is refused, as the spec requires.
  const version = request.headers.get("mcp-protocol-version");
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return rpcError(400, -32600, `Unsupported MCP-Protocol-Version: ${version}`);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return rpcError(413, -32600, "Request body too large.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return rpcError(400, -32700, "Parse error.");
  }

  const outcome = await handleMcpPayload(payload, server);
  if (outcome.body === undefined) {
    return new Response(null, { status: outcome.status, headers: NO_STORE });
  }

  return json(outcome.status, outcome.body);
}

// No server-initiated stream and no sessions to end: the spec allows answering 405 to both.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
