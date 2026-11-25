// A real MCP client for tests (task 4.8): the official @modelcontextprotocol/client, as an agent's
// host uses it (initialize handshake, then requests over Streamable HTTP). It is loaded from the
// @gavdi/cap-mcp v2 checkout's node_modules, where it is a dev dependency, so cap-okf adds none;
// tests that use it run only where the checkout is (describeWithCommunity).
import path from "node:path";
import { COMMUNITY_ROOT } from "./community";

/** The parts of the SDK's Client the tests use. */
export interface McpClient {
  listTools(): Promise<{ tools: { name: string; description?: string }[] }>;
  /** The server's instructions from the initialize handshake. */
  getInstructions(): string | undefined;
  callTool(params: { name: string; arguments: object }): Promise<ToolResult>;
  listResources(): Promise<{ resources: { uri: string }[] }>;
  listResourceTemplates(): Promise<{ resourceTemplates: { uriTemplate: string; name: string }[] }>;
  readResource(params: { uri: string }): Promise<{ contents: { uri: string; text?: string }[] }>;
  complete(params: {
    ref: { type: "ref/resource"; uri: string };
    argument: { name: string; value: string };
  }): Promise<{ completion: { values: string[]; hasMore?: boolean } }>;
  close(): Promise<void>;
}

export interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

interface Sdk {
  Client: new (info: { name: string; version: string }) => McpClient & {
    connect(transport: unknown): Promise<void>;
  };
  StreamableHTTPClientTransport: new (url: URL, options: object) => unknown;
}

function sdk(): Sdk {
  const entry = path.join(COMMUNITY_ROOT, "node_modules", "@modelcontextprotocol", "client");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(entry) as Sdk;
}

/** A user of the app's mocked authentication. */
export interface Login {
  username: string;
  password: string;
}

/** Connects to the app's /mcp endpoint as `login`, or anonymously. */
export async function connectMcp(baseUrl: string, login?: Login): Promise<McpClient> {
  const { Client, StreamableHTTPClientTransport } = sdk();
  const headers: Record<string, string> =
    login === undefined
      ? {}
      : {
          authorization: `Basic ${Buffer.from(`${login.username}:${login.password}`).toString("base64")}`,
        };
  const client = new Client({ name: "cap-okf-tests", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), { requestInit: { headers } }),
  );
  return client;
}
