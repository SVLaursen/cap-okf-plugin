// An empty CAP plugin, registered under an MCP plugin's package name in tests that only need
// cap-okf to find that name in cds.env.plugins (ADR-0006: detection by name). It does nothing,
// so these tests run everywhere, also where no @gavdi/cap-mcp checkout is built (CI).
