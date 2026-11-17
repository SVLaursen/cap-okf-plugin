// The time an export is stamped with (task 2.8). Maintainer decision: SOURCE_DATE_EPOCH, the
// reproducible-builds standard (https://reproducible-builds.org/specs/source-date-epoch/), when
// set, so CI and golden tests get identical bytes; else the system clock.

/**
 * The export time from the environment: SOURCE_DATE_EPOCH in whole seconds since 1970 when set,
 * else `systemClock()`. Throws an [okf] error for any other value.
 */
import { setupError } from "./errors";

export function clockFrom(env: NodeJS.ProcessEnv, systemClock: () => Date): Date {
  const epoch = env["SOURCE_DATE_EPOCH"];
  if (epoch === undefined) return systemClock();
  if (!/^\d+$/.test(epoch)) {
    throw setupError(
      `[okf] SOURCE_DATE_EPOCH — ${JSON.stringify(epoch)} is not a whole number of seconds since 1970.\n` +
        "  Set it to e.g. the time of the last commit: git log -1 --format=%ct",
    );
  }
  return new Date(Number(epoch) * 1000);
}
