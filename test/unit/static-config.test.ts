import { staticRouteOf } from "../../src/serve/static-config";

// Task 4.3: cds.okf.serve.static is false (default) | true (/okf) | "/path" (ADR-0002).

describe("staticRouteOf", () => {
  test.each([
    [undefined, undefined],
    [{}, undefined],
    [{ serve: {} }, undefined],
    [{ serve: { static: false } }, undefined],
    [{ serve: { static: null } }, undefined],
    [{ serve: { static: true } }, "/okf"],
    [{ serve: { static: "/knowledge" } }, "/knowledge"],
    [{ serve: { static: "/docs/okf/" } }, "/docs/okf"],
  ])("cds.okf %j → %j", (okf, route) => {
    expect(staticRouteOf(okf)).toBe(route);
  });

  test.each([
    [{ serve: { static: "knowledge" } }, /must start with \//],
    [{ serve: { static: "/" } }, /can't be \//],
    [{ serve: { static: 5 } }, /is not a known value/],
    [{ serve: { static: "/a b" } }, /must be a path of letters, digits/],
  ])("refuses cds.okf %j with an [okf] message and a fix", (okf, problem) => {
    expect(() => staticRouteOf(okf)).toThrow(/^\[okf\] cds\.okf\.serve\.static — /);
    expect(() => staticRouteOf(okf)).toThrow(problem);
  });
});
