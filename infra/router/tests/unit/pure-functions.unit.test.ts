import { describe, it, expect } from "vitest";
import {
  parseCookie,
  semverSatisfies,
  resolveOverride,
  resolveTier,
  isNavigation,
  resolveRoute,
  bindingName,
  setCookieHeader,
  errorResponse,
} from "../../src/index";
import type { RoutingConfig } from "../../src/types";

// Helper to create a Request with a cookie header
function reqWithCookie(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://example.com/", { headers });
}

// Helper to create a Request with specific headers
function reqWithHeaders(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

// ----- 1.1 parseCookie (10 tests) -----

describe("parseCookie", () => {
  it("returns null when no cookie header", () => {
    expect(parseCookie(reqWithCookie())).toBeNull();
  });

  it("returns null when no app-version cookie", () => {
    expect(parseCookie(reqWithCookie("foo=bar"))).toBeNull();
  });

  it("parses valid lite cookie", () => {
    expect(parseCookie(reqWithCookie("app-version=0.1.0-27:lite"))).toEqual({
      buildId: "0.1.0-27",
      tier: "lite",
    });
  });

  it("parses valid enterprise cookie among others", () => {
    expect(
      parseCookie(reqWithCookie("session=abc; app-version=1.2.3-99:enterprise; other=x")),
    ).toEqual({ buildId: "1.2.3-99", tier: "enterprise" });
  });

  it("returns null for invalid tier", () => {
    expect(parseCookie(reqWithCookie("app-version=0.1.0-27:pro"))).toBeNull();
  });

  it("returns null when no colon separator", () => {
    expect(parseCookie(reqWithCookie("app-version=0.1.0-27"))).toBeNull();
  });

  it("returns null for invalid buildId format", () => {
    expect(parseCookie(reqWithCookie("app-version=abc:lite"))).toBeNull();
  });

  it("returns null when build number is missing", () => {
    expect(parseCookie(reqWithCookie("app-version=0.1.0:lite"))).toBeNull();
  });

  it("returns null for XSS payload", () => {
    expect(parseCookie(reqWithCookie("app-version=<script>alert(1)</script>:lite"))).toBeNull();
  });

  it("returns null for multiple colons (tier becomes 'extra')", () => {
    expect(parseCookie(reqWithCookie("app-version=0.1.0-27:lite:extra"))).toBeNull();
  });
});

// ----- 1.2 semverSatisfies (10 tests) -----

describe("semverSatisfies", () => {
  it("bare exact match", () => {
    expect(semverSatisfies("1.2.3", "1.2.3")).toBe(true);
  });

  it("exact mismatch", () => {
    expect(semverSatisfies("1.2.3", "1.2.4")).toBe(false);
  });

  it(">= satisfied (equal)", () => {
    expect(semverSatisfies("1.2.3", ">=1.2.3")).toBe(true);
  });

  it(">= not satisfied", () => {
    expect(semverSatisfies("1.2.2", ">=1.2.3")).toBe(false);
  });

  it("> boundary (equal fails)", () => {
    expect(semverSatisfies("1.2.3", ">1.2.3")).toBe(false);
  });

  it("< satisfied", () => {
    expect(semverSatisfies("1.2.2", "<1.2.3")).toBe(true);
  });

  it("<= satisfied", () => {
    expect(semverSatisfies("1.2.3", "<=1.2.3")).toBe(true);
  });

  it("combined range (in)", () => {
    expect(semverSatisfies("1.2.3", ">=1.0.0 <2.0.0")).toBe(true);
  });

  it("combined range (out)", () => {
    expect(semverSatisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
  });

  it("invalid version", () => {
    expect(semverSatisfies("abc", ">=1.0.0")).toBe(false);
  });
});

// ----- 1.3 resolveOverride (5 tests) -----

describe("resolveOverride", () => {
  it("returns null when version is null", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27"],
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
    };
    expect(resolveOverride(config, null)).toBeNull();
  });

  it("returns null when no overrides key", () => {
    const config: RoutingConfig = { default: "0.1.0-27", activeVersions: ["0.1.0-27"] };
    expect(resolveOverride(config, "1.0.0")).toBeNull();
  });

  it("returns matching override", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27"],
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
    };
    expect(resolveOverride(config, "1.0.0")).toBe("0.2.0-5");
  });

  it("returns null when no override matches", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27"],
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
    };
    expect(resolveOverride(config, "0.9.0")).toBeNull();
  });

  it("first match wins", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27"],
      overrides: [
        { desktopRange: ">=1.0.0", webBuildId: "A" },
        { desktopRange: ">=0.9.0", webBuildId: "B" },
      ],
    };
    expect(resolveOverride(config, "1.0.0")).toBe("A");
  });
});

// ----- 1.4 resolveTier (4 tests) -----

describe("resolveTier", () => {
  it("enterprise param wins over cookie", () => {
    expect(resolveTier("enterprise", "lite")).toBe("enterprise");
  });

  it("explicit lite param overrides enterprise cookie", () => {
    expect(resolveTier("lite", "enterprise")).toBe("lite");
  });

  it("null param and no cookie defaults to lite", () => {
    expect(resolveTier(null, undefined)).toBe("lite");
  });

  it("garbage param and no cookie defaults to lite", () => {
    expect(resolveTier("admin", undefined)).toBe("lite");
  });
});

// ----- 1.5 isNavigation (6 tests) -----

describe("isNavigation", () => {
  it("returns true when build param present", () => {
    const req = reqWithHeaders("https://example.com/?build=1.0.0");
    expect(isNavigation(req, new URL(req.url))).toBe(true);
  });

  it("returns true when type param present", () => {
    const req = reqWithHeaders("https://example.com/?type=enterprise");
    expect(isNavigation(req, new URL(req.url))).toBe(true);
  });

  it("returns true for root path", () => {
    const req = reqWithHeaders("https://example.com/");
    expect(isNavigation(req, new URL(req.url))).toBe(true);
  });

  it("returns true for non-file path with html accept", () => {
    const req = reqWithHeaders("https://example.com/dashboard", { accept: "text/html" });
    expect(isNavigation(req, new URL(req.url))).toBe(true);
  });

  it("returns false for asset path with dot", () => {
    const req = reqWithHeaders("https://example.com/assets/app.js", { accept: "text/html" });
    expect(isNavigation(req, new URL(req.url))).toBe(false);
  });

  it("returns false for non-file path without html accept", () => {
    const req = reqWithHeaders("https://example.com/dashboard", { accept: "application/json" });
    expect(isNavigation(req, new URL(req.url))).toBe(false);
  });

  it("returns true when ?pin= param is present", () => {
    const req = reqWithHeaders("https://example.com/?pin=0.1.0-27");
    expect(isNavigation(req, new URL(req.url))).toBe(true);
  });
});

// ----- 1.6 resolveRoute (8 tests) -----

describe("resolveRoute", () => {
  const baseConfig: RoutingConfig = {
    default: "0.1.0-27",
    activeVersions: ["0.1.0-27"],
  };

  it("non-nav with valid active cookie returns cookie source", () => {
    const url = new URL("https://example.com/assets/app.js");
    const cookie = { buildId: "0.1.0-27", tier: "lite" as const };
    const result = resolveRoute(baseConfig, url, cookie, false);
    expect(result).toEqual({ buildId: "0.1.0-27", tier: "lite", source: "cookie" });
  });

  it("non-nav with stale cookie falls to default", () => {
    const url = new URL("https://example.com/assets/app.js");
    const cookie = { buildId: "0.0.1-1", tier: "lite" as const };
    const result = resolveRoute(baseConfig, url, cookie, false);
    expect(result).toEqual({ buildId: "0.1.0-27", tier: "lite", source: "default" });
  });

  it("navigation ignores valid cookie", () => {
    const url = new URL("https://example.com/");
    const cookie = { buildId: "0.1.0-27", tier: "lite" as const };
    const result = resolveRoute(baseConfig, url, cookie, true);
    expect(result?.source).not.toBe("cookie");
    expect(result).toEqual({ buildId: "0.1.0-27", tier: "lite", source: "default" });
  });

  it("no override returns default", () => {
    const url = new URL("https://example.com/");
    const result = resolveRoute(baseConfig, url, null, true);
    expect(result).toEqual({ buildId: "0.1.0-27", tier: "lite", source: "default" });
  });

  it("override matches when build param present", () => {
    const config: RoutingConfig = {
      ...baseConfig,
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
    };
    const url = new URL("https://example.com/?build=1.0.0");
    const result = resolveRoute(config, url, null, true);
    expect(result).toEqual({ buildId: "0.2.0-5", tier: "lite", source: "override" });
  });

  it("override with invalid buildId falls to default", () => {
    const config: RoutingConfig = {
      ...baseConfig,
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "invalid" }],
    };
    const url = new URL("https://example.com/?build=1.0.0");
    const result = resolveRoute(config, url, null, true);
    expect(result).toEqual({ buildId: "0.1.0-27", tier: "lite", source: "default" });
  });

  it("returns null when no default configured", () => {
    const config: RoutingConfig = { default: "", activeVersions: [] };
    const url = new URL("https://example.com/");
    expect(resolveRoute(config, url, null, true)).toBeNull();
  });

  it("tier from type param", () => {
    const url = new URL("https://example.com/?type=enterprise");
    const result = resolveRoute(baseConfig, url, null, true);
    expect(result?.tier).toBe("enterprise");
  });

  it("pin param routes to pinned version when valid and active", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27", "0.2.0-42"],
    };
    const url = new URL("https://example.com/?pin=0.2.0-42");
    const result = resolveRoute(config, url, null, true);
    expect(result).toEqual({ source: "pin", buildId: "0.2.0-42", tier: "lite" });
  });

  it("pin param returns null when not in activeVersions", () => {
    const url = new URL("https://example.com/?pin=9.9.9-999");
    const result = resolveRoute(baseConfig, url, null, true);
    expect(result).toBeNull();
  });

  it("pin param returns null when invalid format", () => {
    const url = new URL("https://example.com/?pin=bad-format");
    const result = resolveRoute(baseConfig, url, null, true);
    expect(result).toBeNull();
  });

  it("pin param respects ?type=enterprise", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27", "0.2.0-42"],
    };
    const url = new URL("https://example.com/?pin=0.2.0-42&type=enterprise");
    const result = resolveRoute(config, url, null, true);
    expect(result).toEqual({ source: "pin", buildId: "0.2.0-42", tier: "enterprise" });
  });

  it("cookie fast-path takes precedence over pin on non-navigation", () => {
    const config: RoutingConfig = {
      default: "0.1.0-27",
      activeVersions: ["0.1.0-27", "0.2.0-42"],
    };
    const url = new URL("https://example.com/?pin=0.2.0-42");
    const cookie = { buildId: "0.1.0-27" as string, tier: "lite" as const };
    const result = resolveRoute(config, url, cookie, false);
    expect(result).toEqual({ source: "cookie", buildId: "0.1.0-27", tier: "lite" });
  });
});

// ----- 1.7 bindingName (2 tests) -----

describe("bindingName", () => {
  it("standard lite binding", () => {
    expect(bindingName("0.1.0-27", "lite")).toBe("APP_V0_1_0_27_LITE");
  });

  it("enterprise binding", () => {
    expect(bindingName("1.2.3-99", "enterprise")).toBe("APP_V1_2_3_99_ENTERPRISE");
  });
});

// ----- 1.8 setCookieHeader (1 test) -----

describe("setCookieHeader", () => {
  it("returns full cookie string with security flags", () => {
    expect(setCookieHeader("0.1.0-27", "lite")).toBe(
      "app-version=0.1.0-27:lite; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });
});

// ----- 1.9 errorResponse (1 test) -----

describe("errorResponse", () => {
  it("returns JSON error with correct status and content-type", async () => {
    const res = errorResponse("test_error", 503);
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "test_error" });
  });
});
