// The skills a request serves, as @gavdi/cap-mcp 2.0 tells mcp:hints providers (their ADR 0017,
// cap-okf ADR-0014). cap-okf never reads cds.mcp or the skills folder: ctx.skills is all it knows.
// An older @gavdi/cap-mcp sends no `skills`; a malformed list or entry counts as no skill, so
// a mistake there can never make cap-okf say more than it does today.
import { isNonEmptyString } from "../../core/values";
import type { HintContext } from "./community-hints";

/** One served skill: its SKILL.md URI and its frontmatter name and description. */
export interface HintSkill {
  uri: string;
  name: string;
  description: string;
}

/** The served skills in the context's order, leaving out anything that isn't a skill. */
export function servedSkills(ctx: HintContext): HintSkill[] {
  if (!Array.isArray(ctx.skills)) return [];
  const skills: HintSkill[] = [];
  for (const entry of ctx.skills) {
    const skill = skillOf(entry);
    if (skill !== undefined) skills.push(skill);
  }
  return skills;
}

function skillOf(entry: unknown): HintSkill | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const { uri, name, description } = entry as Record<string, unknown>;
  if (!isNonEmptyString(uri) || !isNonEmptyString(name)) return undefined;
  return { uri, name, description: typeof description === "string" ? description : "" };
}
