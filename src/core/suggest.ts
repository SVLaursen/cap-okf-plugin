// "Did you mean" hints: the bundle path closest to a path that doesn't exist. Pure module.
//
// A bundle can have thousands of paths, and each missing path is compared with all of them, so
// two cheap lower bounds skip most paths before the full edit distance is computed.

/** Character counts of a path: one slot per ASCII character, plus one for all others. */
type CharacterCounts = Int32Array;

const OTHER_CHARACTERS = 128;

interface Candidate {
  path: string;
  counts: CharacterCounts;
}

/**
 * Prepares `paths` once and returns a function that finds the closest of them to a path,
 * remembering every answer. Undefined when even the closest path differs in more than a third
 * of the characters (at least 2 edits are always allowed): such a hint would mislead more
 * than help. Of two equally close paths, the one that sorts first wins, on every run.
 */
export function createPathSuggester(
  paths: readonly string[],
): (missingPath: string) => string | undefined {
  const candidates = [...paths].sort().map((path) => ({ path, counts: characterCounts(path) }));
  const answers = new Map<string, string | undefined>();
  return (missingPath) => {
    if (!answers.has(missingPath)) answers.set(missingPath, closest(missingPath, candidates));
    return answers.get(missingPath);
  };
}

/** The closest of `paths` to `path`, as createPathSuggester finds it, for a single question. */
export function closestPath(path: string, paths: readonly string[]): string | undefined {
  return createPathSuggester(paths)(path);
}

function closest(path: string, candidates: readonly Candidate[]): string | undefined {
  const counts = characterCounts(path);
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(path.length / 3)) + 1;
  for (const candidate of candidates) {
    // Only a strictly smaller distance can replace the best one found so far.
    const limit = bestDistance - 1;
    // Cheap lower bounds first, so most far-off paths never reach the full computation.
    if (Math.abs(path.length - candidate.path.length) > limit) continue;
    if (characterDistance(counts, candidate.counts) > limit) continue;
    const distance = editDistance(path, candidate.path, limit);
    if (distance < bestDistance) {
      best = candidate.path;
      bestDistance = distance;
    }
  }
  return best;
}

function characterCounts(text: string): CharacterCounts {
  const counts = new Int32Array(OTHER_CHARACTERS + 1);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    counts[Math.min(code, OTHER_CHARACTERS)]! += 1;
  }
  return counts;
}

/**
 * A lower bound on the edit distance that only counts characters, ignoring their order:
 * every character that one path has more of than the other needs at least one edit.
 */
function characterDistance(a: CharacterCounts, b: CharacterCounts): number {
  let onlyInA = 0;
  let onlyInB = 0;
  for (let slot = 0; slot <= OTHER_CHARACTERS; slot++) {
    const surplus = a[slot]! - b[slot]!;
    if (surplus > 0) onlyInA += surplus;
    else onlyInB -= surplus;
  }
  // One change can fix a surplus on both sides at once, so the larger side is the bound.
  return Math.max(onlyInA, onlyInB);
}

/**
 * Levenshtein distance: the fewest single-character inserts, deletes and changes from a to b.
 * With a `limit`, the search stops as soon as the distance must be larger, and returns
 * limit + 1: callers that only want close paths don't pay for the far ones.
 *
 * Written with two reused number rows and plain comparisons: this is the inner loop of every
 * suggestion, and Math.min or new arrays per row made it many times slower.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  // previous[j] is the distance from the first i - 1 characters of a to the first j of b.
  let previous = new Int32Array(b.length + 1);
  let current = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cell = smallestEdit(previous, current, j, a[i - 1] === b[j - 1]);
      current[j] = cell;
      if (cell < rowMinimum) rowMinimum = cell;
    }
    // Every later row is at least the smallest value in this one.
    if (rowMinimum > limit) return limit + 1;
    [previous, current] = [current, previous];
  }
  const distance = previous[b.length]!;
  return distance > limit ? limit + 1 : distance;
}

// The cheapest way to reach cell j of the current row: delete, insert, or change (or keep).
function smallestEdit(
  previous: Int32Array,
  current: Int32Array,
  j: number,
  sameCharacter: boolean,
): number {
  // The ! marks are safe: j is always within both rows.
  const deleteCost = previous[j]! + 1;
  const insertCost = current[j - 1]! + 1;
  const changeCost = previous[j - 1]! + (sameCharacter ? 0 : 1);
  let cheapest = deleteCost < insertCost ? deleteCost : insertCost;
  if (changeCost < cheapest) cheapest = changeCost;
  return cheapest;
}
