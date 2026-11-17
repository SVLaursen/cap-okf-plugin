import { clockFrom } from "../../src/build/clock";

// The CLI's clock (task 2.8, maintainer decision): SOURCE_DATE_EPOCH when set, so CI and golden
// tests get identical bytes; else the current time.

describe("clockFrom", () => {
  test("uses SOURCE_DATE_EPOCH, in seconds since 1970", () => {
    expect(clockFrom({ SOURCE_DATE_EPOCH: "1795001400" }, () => new Date(0)).toISOString()).toBe(
      "2026-11-18T11:30:00.000Z",
    );
  });

  test("without it, asks the system clock", () => {
    const system = new Date("2026-11-17T09:30:00Z");
    expect(clockFrom({}, () => system)).toBe(system);
  });

  test.each(["", "soon", "1.5", "-1", "1e3", " 12"])("refuses SOURCE_DATE_EPOCH=%j", (value) => {
    expect(() => clockFrom({ SOURCE_DATE_EPOCH: value }, () => new Date(0))).toThrow(
      /^\[okf\] SOURCE_DATE_EPOCH — /,
    );
  });
});
