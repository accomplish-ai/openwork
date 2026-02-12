import { describe, it, expect } from "vitest";
import { resolveRoute, isNavigation } from "./index";
import type { RoutingConfig } from "./types";

const DEFAULT_BUILD = "0.1.0-27";
const PINNED_BUILD = "0.2.0-42";

function makeConfig(overrides?: Partial<RoutingConfig>): RoutingConfig {
  return {
    default: DEFAULT_BUILD,
    activeVersions: [DEFAULT_BUILD, PINNED_BUILD],
    overrides: [],
    ...overrides,
  };
}

function makeUrl(params: Record<string, string> = {}): URL {
  const url = new URL("https://example.com/");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url;
}

function makeRequest(accept = "text/html"): Request {
  return new Request("https://example.com/", {
    headers: { accept },
  });
}

describe("resolveRoute with ?pin=", () => {
  it("routes to pinned version when valid and in activeVersions", () => {
    const route = resolveRoute(
      makeConfig(),
      makeUrl({ pin: PINNED_BUILD }),
      null,
      true,
    );
    expect(route).toEqual({
      buildId: PINNED_BUILD,
      tier: "lite",
      source: "pin",
    });
  });

  it("returns null when pin is not in activeVersions", () => {
    const route = resolveRoute(
      makeConfig(),
      makeUrl({ pin: "9.9.9-999" }),
      null,
      true,
    );
    expect(route).toBeNull();
  });

  it("returns null when pin has invalid format", () => {
    const route = resolveRoute(
      makeConfig(),
      makeUrl({ pin: "bad-format" }),
      null,
      true,
    );
    expect(route).toBeNull();
  });

  it("respects ?type=enterprise with pin", () => {
    const route = resolveRoute(
      makeConfig(),
      makeUrl({ pin: PINNED_BUILD, type: "enterprise" }),
      null,
      true,
    );
    expect(route).toEqual({
      buildId: PINNED_BUILD,
      tier: "enterprise",
      source: "pin",
    });
  });

  it("cookie fast-path takes precedence on non-navigation requests", () => {
    const cookie = { buildId: DEFAULT_BUILD, tier: "lite" as const };
    const route = resolveRoute(
      makeConfig(),
      makeUrl({ pin: PINNED_BUILD }),
      cookie,
      false,
    );
    expect(route).toEqual({
      buildId: DEFAULT_BUILD,
      tier: "lite",
      source: "cookie",
    });
  });
});

describe("isNavigation with ?pin=", () => {
  it("returns true when ?pin= is present", () => {
    const url = makeUrl({ pin: PINNED_BUILD });
    expect(isNavigation(makeRequest(), url)).toBe(true);
  });

  it("returns true for root path", () => {
    const url = new URL("https://example.com/");
    expect(isNavigation(makeRequest(), url)).toBe(true);
  });

  it("returns false for asset paths without query params", () => {
    const url = new URL("https://example.com/assets/main.js");
    expect(isNavigation(makeRequest("*/*"), url)).toBe(false);
  });
});
