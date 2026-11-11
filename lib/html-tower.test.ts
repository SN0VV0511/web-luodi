import { describe, expect, it } from "vitest";
import { parseTowerPages, towerPagesToArchiveFloors, towerPagesToFloors } from "./html-tower";

describe("html-tower 客户端", () => {
  const pages = parseTowerPages({
    pages: [
      { id: "0123456789ab", title: "  第一页 ", filename: "one.html", size: 10, createdAt: "2026-11-11T15:00:00+0800", url: "//evil.example/x" },
      { id: "../etc/passwd", title: "bad" },
      { id: "ba9876543210", title: "", filename: "two.htm", size: 20, createdAt: "bogus" },
    ],
  });

  it("只接受合法 id，并总是重建同源 /tower/p 地址", () => {
    expect(pages.map((p) => p.id)).toEqual(["0123456789ab", "ba9876543210"]);
    expect(pages[0]!.url).toBe("/tower/p/0123456789ab.html");
    expect(pages[0]!.title).toBe("第一页");
    expect(pages[1]!.title).toBe("ba9876543210");
    expect(parseTowerPages(null)).toEqual([]);
    expect(parseTowerPages({ pages: "nope" })).toEqual([]);
  });

  it("上传页面从 3F 开始续楼层，标记为沙箱页面", () => {
    const floors = towerPagesToFloors(pages);
    expect(floors.map((f) => f.floor)).toEqual(["3F", "4F"]);
    expect(floors[0]).toMatchObject({ href: "/tower/p/0123456789ab.html", sandboxed: true });
    expect(floors[0]!.description.zh).toContain("2026-11-11 上传");
    const archive = towerPagesToArchiveFloors(pages);
    expect(archive[1]).toMatchObject({ id: "ba9876543210", code: "4F" });
  });
});
