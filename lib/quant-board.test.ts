import { describe, expect, it } from "vitest";
import { boardRows, money, parseSnapshot, pnlColor, pnlLabel } from "@/lib/quant-board";

describe("持仓大屏快照解析", () => {
  it("解析导出的静态快照，保留行情与资产汇总", () => {
    const data = parseSnapshot({
      updatedAt: "09-17 11:15",
      positions: [
        { code: "002258", name: "利尔化学", shares: 400, avgCost: 15.388, price: 15.25, marketValue: 6100, pnlPct: -0.9 },
      ],
      marketValue: 6100,
      cash: 40761,
      totalValue: 46861,
      dayPnl: -55,
    });
    expect(data).not.toBeNull();
    expect(data?.updatedAt).toBe("09-17 11:15");
    expect(data?.positions).toEqual([{ name: "利尔化学", price: 15.25, pnlPct: -0.9 }]);
    expect(data?.cash).toBe(40761);
    expect(data?.totalValue).toBe(46861);
    expect(data?.dayPnl).toBe(-55);
  });

  it("空仓快照仍然可渲染", () => {
    const data = parseSnapshot({ updatedAt: "09-17 11:15", positions: [], cash: 100, totalValue: 100, dayPnl: 0 });
    expect(data?.positions).toEqual([]);
    expect(data?.cash).toBe(100);
  });

  it("结构异常时判定为无效快照，按拉取失败处理", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("updating")).toBeNull();
    expect(parseSnapshot({ updatedAt: "09-17 11:15" })).toBeNull();
    expect(parseSnapshot({ positions: "closed" })).toBeNull();
  });

  it("缺失名称回退到代码，缺价格丢弃该行并容忍字符串数值", () => {
    const data = parseSnapshot({
      positions: [
        { code: "600000", price: 8.8 },
        { name: "坏数据", price: "NaN" },
        { name: "字符串价格", price: "12.5", pnlPct: "3.2" },
      ],
      cash: "40761",
    });
    expect(data?.positions).toEqual([
      { name: "600000", price: 8.8, pnlPct: 0 },
      { name: "字符串价格", price: 12.5, pnlPct: 3.2 },
    ]);
    expect(data?.cash).toBe(40761);
    expect(data?.totalValue).toBe(0);
  });
});

describe("行情格式与配色（红涨绿跌）", () => {
  it("正收益红色、负收益绿色、持平灰色", () => {
    expect(pnlColor(1.2)).toBe("#ff5d55");
    expect(pnlColor(-0.9)).toBe("#2fe08d");
    expect(pnlColor(0)).toBe("#9fbfae");
    // 两位小数内的抖动视为持平，避免满屏闪烁。
    expect(pnlColor(0.001)).toBe("#9fbfae");
    expect(pnlColor(-0.004)).toBe("#9fbfae");
  });

  it("百分比带符号，金额带千分位", () => {
    expect(pnlLabel(0.9)).toBe("+0.90%");
    expect(pnlLabel(-2.05)).toBe("-2.05%");
    expect(pnlLabel(0)).toBe("0.00%");
    expect(money(46861)).toBe("46,861");
    expect(money(-1234567)).toBe("-1,234,567");
    expect(money(Number.NaN)).toBe("--");
  });
});

describe("大屏行数上限", () => {
  it("超过六只持仓时截断并报告余量", () => {
    const positions = Array.from({ length: 9 }, (_, index) => ({ name: `股${index}`, price: 10, pnlPct: 1 }));
    const { rows, overflow } = boardRows(positions);
    expect(rows).toHaveLength(6);
    expect(overflow).toBe(3);
  });

  it("不足六只时全部显示且无余量", () => {
    const { rows, overflow } = boardRows([{ name: "利尔化学", price: 15.25, pnlPct: -0.9 }]);
    expect(rows).toHaveLength(1);
    expect(overflow).toBe(0);
  });
});
