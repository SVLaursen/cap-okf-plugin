# Draft: feature request for `@cap-js/mcp`

> Status: **draft, not filed.** Written in cap-okf task 0.5 (ADR-0006). Filing it is the
> maintainer's decision. Checked against `@cap-js/mcp` 1.5.0.

---

**Title:** Let plugins contribute MCP resources to a service's MCP server

**Problem**

`@cap-js/mcp` serves `describe`, `query` and `call` tools for each `@mcp` service. Some plugins
have read-only documents that belong next to those tools and that hosts or users should be able to
attach as context: in our case, Markdown knowledge about the app's model in the Open Knowledge
Format (OKF).

MCP has resources for exactly this. But `@cap-js/mcp` has no way for another plugin to add any:
the `McpServer` is built inside the protocol adapter for each request, and nothing is emitted or
exported to hook into. The only option today is to wrap documents in a CDS entity and let agents
query them as tools. That works, but hosts can't list or pin the documents.

**Proposal**

A small, opt-in hook. Because this adapter runs one MCP server per service, the hook is per
service too, for example a CAP event emitted once for each `@mcp` service when the adapter is set
up:

```js
cds.on('mcp:service-resources', (registry, srv) => {
  if (srv.name !== 'OkfService') return
  registry.register({
    uri: 'okf://index.md',
    name: 'okf-index',
    mimeType: 'text/markdown',
    read: ({ user, locale }) => '…',     // per resources/read, inside cds.context; undefined = not found
    visible: ({ user }) => true          // optional
  })
})
```

The adapter would then:

- add the resources the caller can see to that service's per-request server;
- advertise `resources: { listChanged: false }` only when there is at least one;
- answer `undefined` from `read` with resource-not-found, and a thrown error as an internal error;
- refuse duplicate URIs.

Nothing changes for apps that don't use the hook.

**Alternatives considered**

- Documents as a CDS entity behind the `query` tool: works today, but hosts can't list or pin
  them.
- A separate MCP server for the documents: a second endpoint and a second client configuration
  for every app.

**Prior art**

`@gavdi/cap-mcp` v2 has a similar `mcp:apps` event for `ui://` resources. A general
`mcp:resources` event has been proposed there. It is emitted once for the whole app, since that
plugin serves all services from one MCP server, so it uses a different name from the per-service
hook above.
