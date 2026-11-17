// The MCP resources channel (task 4.6) as a channel for the server contract (task 4.1): reads
// okf:// resources through @gavdi/cap-mcp's /mcp endpoint, as an MCP client does.
// - read: resources/read of okf://<namespace>/<path>, each segment percent-encoded; a JSON-RPC
//   error is "not found", with the requested URI replaced by <uri>, so answers for two paths
//   can be compared (the plugin echoes the URI it was asked for).
// - list: completion of the concept template's path variable from "", as a client fills it in.
// Readers: bob is authenticated without roles; with the default requires (authenticated-user)
// an anonymous caller is the one who doesn't meet it.
import { rpc, type RpcAnswer } from "../helpers/mcp-rpc";
import { BOB } from "./mcp-tools-channel";
import type { Answer, Channel, Reader } from "./server.contract";

type Post = Parameters<typeof rpc>[0];

function authOf(reader: Reader): { username: string; password: string } | undefined {
  return reader === "authenticated" ? BOB : undefined;
}

/** The URI a client builds for a bundle path. */
export function uriOf(namespace: string, path: string): string {
  return `okf://${namespace}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The resources channel of the app that `post` talks to, under `namespace`. */
export function mcpResourcesChannel(post: Post, namespace: string): Channel {
  return {
    async read(path, reader): Promise<Answer> {
      const uri = uriOf(namespace, path);
      return answerOf(await rpc(post, authOf(reader), "resources/read", { uri }), uri);
    },
    async list(reader): Promise<string[]> {
      const answer = await rpc(post, authOf(reader), "completion/complete", {
        ref: { type: "ref/resource", uri: `okf://${namespace}/{+path}` },
        argument: { name: "path", value: "" },
      });
      const completion = answer.message?.result?.["completion"] as
        { values: string[]; hasMore?: boolean } | undefined;
      if (completion === undefined) return [];
      // Completion passes on at most 100 values; the demo has fewer, and more would hide paths.
      if (completion.hasMore === true) throw new Error("completion has more than 100 paths");
      return [...completion.values].sort();
    },
  };
}

function answerOf(answer: RpcAnswer, uri: string): Answer {
  const error = answer.message?.error;
  if (error !== undefined) {
    return { notFound: `${error.code} ${error.message}`.replaceAll(uri, "<uri>") };
  }
  const contents = answer.message?.result?.["contents"] as { text?: unknown }[] | undefined;
  // Not an MCP answer at all (e.g. HTTP 401): fail, so a check can't pass on two equal failures.
  if (contents === undefined) throw new Error(`no MCP answer for ${uri}: HTTP ${answer.status}`);
  const text = contents[0]?.text;
  return typeof text === "string" ? { text } : { notFound: "no text" };
}
