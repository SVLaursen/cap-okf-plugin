// Test helper: a generated file as an unauthenticated reader gets it (ADR-0003), i.e. with
// everything between the authorization markers removed, markers included. Task 4.x adds the
// servers' own filter; this one is deliberately simple so the tests don't depend on it.

// Markers count only as whole lines (the contract for the 4.2 filter). The blank lines before
// the section go with it, so the rest reads as if it was never there.
const AUTH_SECTION = /\n*^<!-- okf:auth:start -->$[\s\S]*?^<!-- okf:auth:end -->$/gm;

export function outsideAuthSection(text: string): string {
  return text.replace(AUTH_SECTION, "");
}
