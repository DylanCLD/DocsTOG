// Minimal Model Context Protocol server core: JSON-RPC 2.0 over the Streamable HTTP
// transport, in stateless JSON mode. It implements what a tools-only server needs
// (initialize, ping, tools/list, tools/call) so the project needs no MCP dependency.

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchemaObject;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  /** Receives the raw `arguments` value; validation is the tool's job. */
  run: (args: unknown) => Promise<ToolResult>;
};

export type McpServerDefinition = {
  name: string;
  title: string;
  version: string;
  instructions: string;
  tools: ToolDefinition[];
};

export type McpHttpOutcome = {
  status: number;
  /** Absent for 202 Accepted (notifications and responses). */
  body?: unknown;
};

// Newest first. The client's requested version is used when it is in this list,
// otherwise the newest one is offered and the client decides whether it can use it.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

const ERROR = {
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603
} as const;

type JsonRpcId = string | number | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(id: unknown): id is string | number {
  return typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
}

function errorResponse(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function resultResponse(id: string | number, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function negotiateVersion(requested: unknown) {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

async function callTool(id: string | number, params: unknown, server: McpServerDefinition) {
  if (!isRecord(params) || typeof params.name !== "string") {
    return errorResponse(id, ERROR.invalidParams, "tools/call requires a tool name.");
  }

  const tool = server.tools.find((candidate) => candidate.name === params.name);
  if (!tool) {
    return errorResponse(id, ERROR.invalidParams, `Unknown tool: ${params.name}`);
  }

  try {
    return resultResponse(id, await tool.run(params.arguments ?? {}));
  } catch (error) {
    // A failing tool is reported as a tool error so the model can react; details stay in the logs.
    console.error("[mcp] tool failed", { tool: tool.name, error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error && error.message ? error.message : "Unexpected error.";
    return resultResponse(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
  }
}

async function handleRequest(message: Record<string, unknown>, server: McpServerDefinition) {
  const id = message.id as string | number;
  const method = message.method as string;

  switch (method) {
    case "initialize": {
      const params = isRecord(message.params) ? message.params : {};
      return resultResponse(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions
      });
    }
    case "ping":
      return resultResponse(id, {});
    case "tools/list":
      return resultResponse(id, {
        tools: server.tools.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { title, ...annotations }
        }))
      });
    case "tools/call":
      return callTool(id, message.params, server);
    default:
      return errorResponse(id, ERROR.methodNotFound, `Method not found: ${method}`);
  }
}

/** Handles one JSON-RPC message. Returns null when nothing must be sent back (notifications, responses). */
async function handleMessage(message: unknown, server: McpServerDefinition) {
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return errorResponse(null, ERROR.invalidRequest, "Invalid JSON-RPC message.");
  }

  const isRequest = typeof message.method === "string";

  // A response sent by the client (we never send requests, so there is nothing to match).
  if (!isRequest) {
    return "result" in message || "error" in message
      ? null
      : errorResponse(null, ERROR.invalidRequest, "Invalid JSON-RPC message.");
  }

  // A notification has no id (notifications/initialized, notifications/cancelled, ...): accept and ignore.
  if (!("id" in message)) {
    return null;
  }

  if (!isValidId(message.id)) {
    return errorResponse(null, ERROR.invalidRequest, "Request id must be a string or a number.");
  }

  try {
    return await handleRequest(message, server);
  } catch (error) {
    console.error("[mcp] request failed", { method: message.method, error: error instanceof Error ? error.message : String(error) });
    return errorResponse(message.id, ERROR.internal, "Internal error.");
  }
}

/** Entry point for a parsed POST body (a single message or, for older clients, a batch). */
export async function handleMcpPayload(payload: unknown, server: McpServerDefinition): Promise<McpHttpOutcome> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 400, body: errorResponse(null, ERROR.invalidRequest, "Empty batch.") };
    }

    const responses = (await Promise.all(payload.map((message) => handleMessage(message, server)))).filter(
      (response) => response !== null
    );
    return responses.length > 0 ? { status: 200, body: responses } : { status: 202 };
  }

  const response = await handleMessage(payload, server);
  if (response === null) {
    return { status: 202 };
  }

  // A malformed message (no valid request id) is a client error; everything else is a JSON-RPC response.
  return { status: "error" in response && response.id === null ? 400 : 200, body: response };
}
