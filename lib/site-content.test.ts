import { describe, expect, it } from "vitest";

import { formatListIndex, pickLocale } from "@/lib/site-content";

describe("site content helpers", () => {
  it("按当前语言读取双语文案", () => {
    expect(pickLocale({ zh: "中文", en: "English" }, "zh")).toBe("中文");
    expect(pickLocale({ zh: "中文", en: "English" }, "en")).toBe("English");
  });

  it("为行式列表生成从一开始的两位序号", () => {
    expect(formatListIndex(0)).toBe("01");
    expect(formatListIndex(8)).toBe("09");
    expect(formatListIndex(99)).toBe("100");
  });

  it("拒绝无效列表下标", () => {
    expect(() => formatListIndex(-1)).toThrow(RangeError);
    expect(() => formatListIndex(1.5)).toThrow("列表下标必须是非负整数");
  });
});
