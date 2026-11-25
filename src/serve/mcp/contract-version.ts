// Both @gavdi/cap-mcp events hand listeners a registry with a contractVersion (their ADRs 0013
// and 0014). It rises only for breaking changes, so cap-okf uses a registry only when it is the
// version it was written for: a later one is met with a warning, never used by accident.

/** The contract version of mcp:resources and mcp:hints that cap-okf implements. */
export const CONTRACT_VERSION = 1;

/**
 * True when the registry is the version cap-okf knows; otherwise warns once (each event is
 * emitted once per server) and returns false, so the caller registers nothing.
 */
export function isKnownContract(
  event: string,
  registry: { contractVersion?: unknown },
  warn: (message: string) => void,
): boolean {
  const version = registry.contractVersion;
  if (version === CONTRACT_VERSION) return true;
  warn(
    `[okf] ${event} — @gavdi/cap-mcp offers contract version ${String(version)}, but cap-okf knows version ${CONTRACT_VERSION} only, so nothing is registered from it.\n` +
      `  Use a @gavdi/cap-mcp release with ${event} contract version ${CONTRACT_VERSION}, or a cap-okf release that supports version ${String(version)}.`,
  );
  return false;
}
