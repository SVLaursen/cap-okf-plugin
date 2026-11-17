// The two MCP channels (tasks 4.5, 4.6) as channels for the server contract (4.1), read through a
// real MCP client (task 4.8) instead of hand-written JSON-RPC.
// - Tools: getConcept reads; searchConcepts without words lists (at most 100 concepts).
// - Resources: resources/read reads okf://<namespace>/<path>; completion of the template lists.
// A thrown MCP error or a tool error is "not found", with the requested path or URI replaced by
// <path>, so the answers for two paths can be compared (hiddenContract).
import type { Login, McpClient, ToolResult } from "../helpers/mcp-client";
import type { Answer, Channel, Reader } from "./server.contract";

/** A client per reader: one signed in, one anonymous. */
export type Clients = (reader: Reader) => Promise<McpClient>;

/** The fixture's users: one who meets requires, and one signed in without the required role. */
export interface Logins {
  authenticated: Login;
  "without-required-role": Login;
}

/** The login a reader uses; "anonymous" uses none. */
export function loginOf(reader: Reader, logins: Logins): Login | undefined {
  return reader === "anonymous" ? undefined : logins[reader];
}

export function toolsChannel(clientFor: Clients): Channel {
  return {
    async read(path, reader) {
      const client = await clientFor(reader);
      const result = await notFoundOnError(path, () =>
        client.callTool({ name: "OkfService_getConcept", arguments: { path } }),
      );
      if ("notFound" in result) return result;
      return toolAnswer(result.value, path);
    },
    async list(reader) {
      const client = await clientFor(reader);
      const result = await client.callTool({
        name: "OkfService_searchConcepts",
        arguments: { top: 100 },
      });
      // Listing is the setup of most contract checks: a failure must say why.
      if (result.isError === true) throw new Error(`searchConcepts failed: ${toolText(result)}`);
      const rows = (result.structuredContent as { value: { path: string }[] }).value;
      return rows.map((row) => row.path).sort();
    },
  };
}

export function resourcesChannel(clientFor: Clients, namespace: string): Channel {
  return {
    async read(path, reader) {
      const client = await clientFor(reader);
      const uri = `okf://${namespace}/${path.split("/").map(encodeURIComponent).join("/")}`;
      const result = await notFoundOnError(uri, () => client.readResource({ uri }));
      if ("notFound" in result) return result;
      const text = result.value.contents[0]?.text;
      return typeof text === "string" ? { text } : { notFound: "no text" };
    },
    async list(reader) {
      const client = await clientFor(reader);
      const { completion } = await client.complete({
        ref: { type: "ref/resource", uri: `okf://${namespace}/{+path}` },
        argument: { name: "path", value: "" },
      });
      // Completion passes on at most 100 values; more would hide paths from the contract.
      if (completion.hasMore === true) throw new Error("completion has more than 100 paths");
      return [...completion.values].sort();
    },
  };
}

// A JSON-RPC error (numeric code, thrown by the client) is the channel's not-found answer.
// Anything else (an HTTP or transport failure) is rethrown, so two equal failures can't pass
// for "the same not-found answer".
async function notFoundOnError<T>(
  asked: string,
  call: () => Promise<T>,
): Promise<{ value: T } | { notFound: string }> {
  try {
    return { value: await call() };
  } catch (error) {
    const { code, message } = error as { code?: unknown; message?: string };
    if (typeof code !== "number") throw error;
    return { notFound: `${String(code)} ${String(message).replaceAll(asked, "<path>")}` };
  }
}

function toolAnswer(result: ToolResult, path: string): Answer {
  if (result.isError === true) return { notFound: toolText(result).replaceAll(path, "<path>") };
  const value = (result.structuredContent as { value?: unknown } | undefined)?.value;
  return typeof value === "string" ? { text: value } : { notFound: "no text" };
}

function toolText(result: ToolResult): string {
  return result.content?.[0]?.text ?? "tool error";
}
