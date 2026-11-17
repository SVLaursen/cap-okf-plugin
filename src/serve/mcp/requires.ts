// cds.okf.serve.mcp.requires (ADR-0010): one rule for both MCP channels. Pure.

/** The part of a cds.User the check needs. */
interface User {
  is(role: string): boolean;
}

function asUser(user: unknown): User | undefined {
  const is = (user as { is?: unknown } | undefined)?.is;
  return typeof is === "function" ? (user as User) : undefined;
}

/** As CAP decides @requires: one of the roles is enough. No user meets nothing. */
export function meetsRequires(user: unknown, roles: readonly string[]): boolean {
  const caller = asUser(user);
  return caller !== undefined && roles.some((role) => caller.is(role));
}

/** Whether CAP has authenticated the caller (ADR-0003 decides on this). */
export function isAuthenticatedUser(user: unknown): boolean {
  return asUser(user)?.is("authenticated-user") === true;
}
