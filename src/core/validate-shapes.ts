// W2: the v0.2 provenance, trust and lifecycle fields have the shape OKF v0.2 §5 gives them.
// Pure module. Every check is skipped when its field is absent: all of §5 is optional.
import type { Frontmatter, KeyPath, LocatedConcept } from "./concept";
import { isIsoDateTime } from "./datetime";
import { findingAtKey, keyName, type Finding } from "./finding";

// Typed as unknown so includes() can test any frontmatter value without a cast.
const STATUSES: readonly unknown[] = ["draft", "stable", "deprecated"];

type Mapping = Record<string, unknown>;

/** All W2 findings for one concept. */
export function checkFieldShapes(located: LocatedConcept, frontmatter: Frontmatter): Finding[] {
  return [
    ...checkGenerated(located, frontmatter["generated"]),
    ...checkVerified(located, frontmatter["verified"]),
    ...checkStatus(located, frontmatter["status"]),
    ...checkStaleAfter(located, frontmatter["stale_after"]),
    ...checkSources(located, frontmatter["sources"]),
  ];
}

function shapeFinding(located: LocatedConcept, keyPath: KeyPath, message: string, fix: string) {
  return findingAtKey(located, keyPath, "W2", { message, fix });
}

function isMapping(value: unknown): value is Mapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

// §5.2: generated: { by, at }, where by is required and at is optional.
function checkGenerated(located: LocatedConcept, generated: unknown): Finding[] {
  if (generated === undefined) return [];
  if (!isMapping(generated)) {
    return [notAnEvent(located, ["generated"])];
  }
  return checkEvent(located, ["generated"], generated, { atRequired: false });
}

// §5.2: a list of { by, at }, or one bare mapping that counts as a one-element list.
function checkVerified(located: LocatedConcept, verified: unknown): Finding[] {
  if (verified === undefined) return [];
  if (!Array.isArray(verified)) {
    return checkVerification(located, ["verified"], verified);
  }
  return verified.flatMap((entry, index) => checkVerification(located, ["verified", index], entry));
}

function checkVerification(located: LocatedConcept, keyPath: KeyPath, entry: unknown) {
  if (!isMapping(entry)) return [notAnEvent(located, keyPath)];
  return checkEvent(located, keyPath, entry, { atRequired: true });
}

function notAnEvent(located: LocatedConcept, keyPath: KeyPath): Finding {
  return shapeFinding(
    located,
    keyPath,
    `"${keyName(keyPath)}" must be a mapping with "by" and "at"`,
    'Write it as { by: "<actor>", at: <ISO 8601 date and time> }',
  );
}

// The by/at pair that generated and every verified entry share.
function checkEvent(
  located: LocatedConcept,
  keyPath: KeyPath,
  event: Mapping,
  options: { atRequired: boolean },
): Finding[] {
  const findings: Finding[] = [];
  const byPath = [...keyPath, "by"];
  const atPath = [...keyPath, "at"];
  if (!isNonEmptyString(event["by"])) {
    findings.push(
      shapeFinding(
        located,
        byPath,
        `"${keyName(byPath)}" is missing or empty`,
        'Name who or what did it, e.g. "human:<id>", "process:<id>" or "<tool>/<version>"',
      ),
    );
  }
  const at = event["at"];
  if (at === undefined && options.atRequired) {
    findings.push(shapeFinding(located, atPath, `"${keyName(atPath)}" is missing`, AT_FIX));
  } else if (at !== undefined && !isIsoDateTime(at, { requireZone: false })) {
    findings.push(
      shapeFinding(
        located,
        atPath,
        `"${keyName(atPath)}" is not an ISO 8601 date and time`,
        AT_FIX,
      ),
    );
  }
  return findings;
}

const AT_FIX = "Write the date and time as ISO 8601, e.g. 2026-11-13T09:00:00Z";

// §5.4: draft | stable | deprecated.
function checkStatus(located: LocatedConcept, status: unknown): Finding[] {
  if (status === undefined || STATUSES.includes(status)) return [];
  return [
    shapeFinding(
      located,
      ["status"],
      `"status" must be draft, stable or deprecated, not ${JSON.stringify(status)}`,
      "Use one of draft, stable or deprecated, or leave status out (it then means stable)",
    ),
  ];
}

// §5.5: an absolute instant, so the time zone is required.
function checkStaleAfter(located: LocatedConcept, staleAfter: unknown): Finding[] {
  if (staleAfter === undefined || isIsoDateTime(staleAfter, { requireZone: true })) return [];
  return [
    shapeFinding(
      located,
      ["stale_after"],
      `"stale_after" is not an absolute instant`,
      "Write an ISO 8601 date and time with Z or an offset, e.g. 2026-12-31T00:00:00Z",
    ),
  ];
}

// §5.1: a list of entries; each needs a resource, and ids must be unique.
function checkSources(located: LocatedConcept, sources: unknown): Finding[] {
  if (sources === undefined) return [];
  if (!Array.isArray(sources)) {
    return [
      shapeFinding(
        located,
        ["sources"],
        `"sources" must be a list`,
        "Write each source as a list entry starting with - resource: <URL or path>",
      ),
    ];
  }
  const seenIds = new Set<string>();
  const findings: Finding[] = [];
  sources.forEach((entry, index) => {
    findings.push(...checkSource(located, entry, index, seenIds));
  });
  return findings;
}

function checkSource(
  located: LocatedConcept,
  entry: unknown,
  index: number,
  seenIds: Set<string>,
): Finding[] {
  const entryPath = ["sources", index];
  if (!isMapping(entry)) {
    return [
      shapeFinding(
        located,
        entryPath,
        `"${keyName(entryPath)}" must be a mapping with at least "resource"`,
        "Write the entry as resource: <URL or path>, with optional id, title and author",
      ),
    ];
  }
  const findings: Finding[] = [];
  if (!isNonEmptyString(entry["resource"])) {
    const resourcePath = [...entryPath, "resource"];
    findings.push(
      shapeFinding(
        located,
        resourcePath,
        `"${keyName(resourcePath)}" is missing`,
        "Add resource: the URL, bundle path or scope the source was taken from",
      ),
    );
  }
  findings.push(...checkSourceId(located, entry["id"], index, seenIds));
  return findings;
}

// Footnotes cite sources by id (§5.1), so a repeated id makes a citation ambiguous.
function checkSourceId(
  located: LocatedConcept,
  id: unknown,
  index: number,
  seenIds: Set<string>,
): Finding[] {
  if (id === undefined) return [];
  const key = String(id);
  if (!seenIds.has(key)) {
    seenIds.add(key);
    return [];
  }
  const idPath = ["sources", index, "id"];
  return [
    shapeFinding(
      located,
      idPath,
      `"${keyName(idPath)}" repeats "${key}"; source ids must be unique`,
      "Give each source its own id, or merge the two entries",
    ),
  ];
}
