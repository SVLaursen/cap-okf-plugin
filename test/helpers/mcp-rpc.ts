// Calls an MCP server over HTTP the way @gavdi/cap-mcp v2's own tests do (its
// test/helpers/mcp.ts): one 2026-07-28 JSON-RPC request per call, no handshake and no session;
// the protocol version, client capabilities and client info go in params._meta, and the method
// and name in Mcp-Method / Mcp-Name headers. Answers come as JSON or as an SSE stream.

const PROTOCOL_VERSION = "2026-07-28";
const CLIENT_INFO = { name: "cap-okf-tests", version: "0.0.0" };

type Post = (
  url: string,
  body: object,
  config: object,
) => Promise<{ status: number; data: unknown; headers: Record<string, unknown> }>;

export interface RpcAnswer {
  status: number;
  /** The JSON-RPC message, when the server sent one. */
  message?: { result?: Record<string, unknown>; error?: { code: number; message: string } };
}

let nextId = 1;

/** Sends one JSON-RPC request to `path` as `auth` (axios basic auth), or anonymously. */
export async function rpc(
  post: Post,
  auth: { username: string; password: string } | undefined,
  method: string,
  params: Record<string, unknown> = {},
  path = "/mcp",
): Promise<RpcAnswer> {
  const body = {
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
      },
    },
  };
  const name =
    method === "tools/call"
      ? params["name"]
      : method === "resources/read"
        ? params["uri"]
        : undefined;
  const response = await post(path, body, {
    ...(auth === undefined ? {} : { auth }),
    validateStatus: () => true,
    responseType: "text",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": method,
      ...(typeof name === "string" ? { "mcp-name": name } : {}),
    },
  });
  return { status: response.status, message: messageOf(response) };
}

// The JSON body, or the last `data:` event of an SSE stream.
function messageOf(response: {
  data: unknown;
  headers: Record<string, unknown>;
}): RpcAnswer["message"] {
  const type = String(response.headers["content-type"] ?? "");
  const data = response.data;
  if (typeof data !== "string" || data === "") return undefined;
  if (type.startsWith("text/event-stream")) {
    const events = data.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    const last = events.at(-1);
    return last === undefined
      ? undefined
      : (JSON.parse(last.slice(5).trim()) as RpcAnswer["message"]);
  }
  return JSON.parse(data) as RpcAnswer["message"];
}
