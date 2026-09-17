import { afterEach, describe, expect, it, vi } from "vitest";
import { safeAppUrl } from "@/lib/city-content";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("城市部署配置", () => {
  it("只开放有效 HTTP(S) URL，并拒绝脚本、相对路径和含凭据地址", () => {
    expect(safeAppUrl("https://example.com/app?q=1#home")).toBe(
      "https://example.com/app?q=1#home",
    );
    expect(safeAppUrl("http://localhost:3000")).toBe("http://localhost:3000/");
    for (const value of [
      undefined,
      "",
      "/app",
      "//example.com",
      "not a url",
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:secret@example.com",
      "https://user@example.com",
    ]) {
      expect(safeAppUrl(value), value).toBeUndefined();
    }
  });

  it("未配置时不冒充环境地址，官方部署入口回退且保留五间空办公室", async () => {
    for (const key of [
      "QUANT",
      "AFFINE",
      "AGENTS",
      "OPENCLAW",
      "NEWS",
      "GUESTBOOK",
    ])
      vi.stubEnv(`NEXT_PUBLIC_${key}_URL`, undefined);
    vi.resetModules();
    const { cityBuildings, cityPlaces } = await import("@/lib/city-content");
    const { communityLinks } = await import("@/lib/community-content");
    expect(
      cityPlaces
        .filter((place) => place.id !== "affine")
        .every((place) => place.href === undefined),
    ).toBe(true);
    expect(cityPlaces.find((place) => place.id === "affine")?.href).toBe(
      "https://sn0vv.top/affine/",
    );
    expect(communityLinks).toEqual({ news: undefined, guestbook: undefined });
    expect(cityBuildings.filter((place) => place.vacant)).toHaveLength(5);
    expect(new Set(cityBuildings.map((place) => place.id)).size).toBe(
      cityBuildings.length,
    );
    expect(cityPlaces.find((place) => place.id === "quant")?.sourceHref).toBe(
      "https://github.com/SN0VV0511/quant-a-stock",
    );
    expect(cityBuildings.find((place) => place.id === "slot-5")).toMatchObject({
      name: "LunaTV",
      href: "https://tv.sn0vv.top/",
      vacant: false,
    });
    expect(cityBuildings.find((place) => place.id === "slot-6")).toMatchObject({
      name: "LunaTV 源浏览器",
      href: "https://sn0vv.top/sources/",
    });
    expect(cityBuildings.find((place) => place.id === "slot-7")).toMatchObject({
      name: "微信推送",
      href: "https://sn0vv.top/wxqr/",
    });
  });

  it("从环境配置读取真实应用入口并拒绝不安全的公共内容链接", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUANT_URL", "https://quant.example.test/");
    vi.stubEnv("NEXT_PUBLIC_AFFINE_URL", "https://affine.example.test/");
    vi.stubEnv("NEXT_PUBLIC_NEWS_URL", "javascript:alert(1)");
    vi.stubEnv("NEXT_PUBLIC_GUESTBOOK_URL", "https://guestbook.example.test/");
    vi.resetModules();
    const { cityPlaces } = await import("@/lib/city-content");
    const { communityLinks } = await import("@/lib/community-content");
    expect(cityPlaces.find((place) => place.id === "quant")?.href).toBe(
      "https://quant.example.test/",
    );
    expect(cityPlaces.find((place) => place.id === "affine")?.href).toBe(
      "https://affine.example.test/",
    );
    expect(communityLinks).toEqual({
      news: undefined,
      guestbook: "https://guestbook.example.test/",
    });
  });
});
