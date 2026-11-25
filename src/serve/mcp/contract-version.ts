// Both @gavdi/cap-mcp events hand listeners a registry with a contractVersion (their ADRs 0013
// and 0014). It rises only for breaking changes, so cap-okf uses a registry only when it is the
// version it was written for: a later one is met with a warning, never used by accident.

/** The contract version of mcp:resources and mcp:hints that cap-okf implements. */
export const CONTRACT_VERSION = 1;

/**
 * True when the registry is the version cap-okf knows; otherwise warns and returns false, so the
 * caller registers nothing. Each event is emitted once per server, so that is one warning each.
 */
export function isKnownContract(
  event: string,
  registry: { contractVersion?: unknown },
  warn: (message: string) => void,
): boolean {
  const version = registry.contractVersion;
  if (version === CONTRACT_VERSION) return true;
  warn(
    `[okf] ${event} — @gavdi/cap-mcp offers ${describeVersion(version)}, but cap-okf knows contract version ${CONTRACT_VERSION} only, so nothing is registered from it.\n` +
      `  Use a @gavdi/cap-mcp release with ${event} contract version ${CONTRACT_VERSION}.`,
  );
  return false;
}

// JSON, so the text "1" shows as "1" and can't be read as the number 1.
function describeVersion(version: unknown): string {
  if (version === undefined) return "no contract version";
  return `contract version ${JSON.stringify(version)}`;
}
