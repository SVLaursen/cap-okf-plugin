// The MCP tools channel (task 4.5) as a channel for the server contract (task 4.1): calls
// OkfService's tools through @gavdi/cap-mcp's /mcp endpoint, as an MCP client does.
// - read: OkfService_getConcept; a JSON-RPC error or a tool error is "not found", with its text.
// - list: OkfService_searchConcepts without words (at most 100 concepts).
// Readers: bob is authenticated without roles; with the default requires (authenticated-user)
// an anonymous caller is the one who doesn't meet it.
import { rpc, type RpcAnswer } from "../helpers/mcp-rpc";
import type { Answer, Channel, Reader } from "./server.contract";

type Post = Parameters<typeof rpc>[0];

/** The demo's mocked user bob: authenticated, no roles. */
export const BOB = { username: "bob", password: "bob" };

function authOf(reader: Reader): { username: string; password: string } | undefined {
  return reader === "authenticated" ? BOB : undefined;
}

/** The tools channel of the app that `post` talks to. */
export function mcpToolsChannel(post: Post): Channel {
  const call = (reader: Reader, name: string, args: object) =>
    rpc(post, authOf(reader), "tools/call", { name, arguments: args });

  return {
    async read(path, reader): Promise<Answer> {
      return answerOf(await call(reader, "OkfService_getConcept", { path }));
    },
    async list(reader): Promise<string[]> {
      const answer = await call(reader, "OkfService_searchConcepts", { top: 100 });
      const rows = (structuredOf(answer) as { value?: { path: string }[] } | undefined)?.value;
      return (rows ?? []).map((row) => row.path).sort();
    },
  };
}

function structuredOf(answer: RpcAnswer): unknown {
  const result = answer.message?.result;
  if (result === undefined || result["isError"] === true) return undefined;
  return result["structuredContent"];
}

function answerOf(answer: RpcAnswer): Answer {
  const error = answer.message?.error;
  if (error !== undefined) return { notFound: `${error.code} ${error.message}` };
  const result = answer.message?.result;
  if (result === undefined) return { notFound: `HTTP ${answer.status}` };
  if (result["isError"] === true) return { notFound: toolErrorText(result) };
  const value = (result["structuredContent"] as { value?: unknown } | undefined)?.value;
  return typeof value === "string" ? { text: value } : { notFound: "no text" };
}

function toolErrorText(result: Record<string, unknown>): string {
  const content = result["content"] as { text?: string }[] | undefined;
  return content?.[0]?.text ?? "tool error";
}
