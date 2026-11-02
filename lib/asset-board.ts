"use client";

/**
 * 左牌(SN0VV 61x21 广告牌)动态轮播模块:
 * - 品牌帧(SN0VV大字+slogan) 与 数据帧(实时持仓行情) 每10秒切换
 * - 数据经 update() 注入(60秒拉取,与quant-board共用parseSnapshot)
 */
import * as THREE from "three";
import { parseSnapshot, type BoardData } from "@/lib/quant-board";

const CANVAS_WIDTH = 2048;
const CANVAS_HEIGHT = 704;
const SWITCH_MS = 10000;

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const MONO = '"SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
const GOLD_LINE = "#a58160";
const GOLD_TEXT = "#d6b490";
const CREAM = "#f3eee2";
const UP_COLOR = "#e8605a";
const DOWN_COLOR = "#7fae95";
const FLAT_COLOR = "#8a8a8a";

export type AssetBoard = {
  texture: THREE.CanvasTexture;
  update: (data: BoardData | null) => void;
  dispose: () => void;
};

export function parseAssetSnapshot(value: unknown): BoardData | null {
  return parseSnapshot(value);
}

export function createAssetBoard(): AssetBoard {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  let lastData: BoardData | null = null;
  let showBrand = true;

  const drawChrome = () => {
    const background = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    background.addColorStop(0, "#232d32");
    background.addColorStop(0.5, "#0f171c");
    background.addColorStop(1, "#1a2328");
    context.fillStyle = background;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 細密建筑制图暗纹网格，赋予远景与近景真实的细腻度
    context.strokeStyle = "rgba(214, 180, 144, 0.04)";
    context.lineWidth = 1;
    for (let x = 70; x <= CANVAS_WIDTH - 70; x += 64) {
      context.beginPath();
      context.moveTo(x, 36);
      context.lineTo(x, CANVAS_HEIGHT - 36);
      context.stroke();
    }
    for (let y = 36; y <= CANVAS_HEIGHT - 36; y += 64) {
      context.beginPath();
      context.moveTo(70, y);
      context.lineTo(CANVAS_WIDTH - 70, y);
      context.stroke();
    }

    // 外层微光细框与四角铜金折角
    context.strokeStyle = "rgba(165, 129, 96, 0.28)";
    context.lineWidth = 1.5;
    context.strokeRect(42, 28, CANVAS_WIDTH - 84, CANVAS_HEIGHT - 56);

    context.strokeStyle = GOLD_TEXT;
    context.lineWidth = 3.5;
    const corner = 26;
    for (const [cx, cy, dx, dy] of [
      [42, 28, 1, 1],
      [CANVAS_WIDTH - 42, 28, -1, 1],
      [42, CANVAS_HEIGHT - 28, 1, -1],
      [CANVAS_WIDTH - 42, CANVAS_HEIGHT - 28, -1, -1],
    ] as const) {
      context.beginPath();
      context.moveTo(cx + dx * corner, cy);
      context.lineTo(cx, cy);
      context.lineTo(cx, cy + dy * corner);
      context.stroke();
    }

    // 上下主分割金线
    context.strokeStyle = GOLD_LINE;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(70, 142);
    context.lineTo(CANVAS_WIDTH - 70, 142);
    context.moveTo(70, CANVAS_HEIGHT - 142);
    context.lineTo(CANVAS_WIDTH - 70, CANVAS_HEIGHT - 142);
    context.stroke();

    // 平行副细线
    context.strokeStyle = "rgba(165, 129, 96, 0.35)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(70, 150);
    context.lineTo(CANVAS_WIDTH - 70, 150);
    context.moveTo(70, CANVAS_HEIGHT - 150);
    context.lineTo(CANVAS_WIDTH - 70, CANVAS_HEIGHT - 150);
    context.stroke();
  };

  const drawBrand = () => {
    drawChrome();
    context.fillStyle = GOLD_TEXT;
    context.font = `600 28px ${MONO}`;
    context.textAlign = "left";
    context.fillText("◆ A PERSONAL METROPOLIS", 70, 98);
    context.textAlign = "center";
    context.fillStyle = "rgba(214, 180, 144, 0.65)";
    context.font = `22px ${MONO}`;
    context.fillText("COASTAL ARCHIVE · N 31°14′ E 121°29′", CANVAS_WIDTH / 2, 98);
    context.fillStyle = GOLD_TEXT;
    context.font = `600 28px ${MONO}`;
    context.textAlign = "right";
    context.fillText("EST. 2026 / VOL. 01", CANVAS_WIDTH - 70, 98);

    // 品牌主字底层暖金微偏移投影
    context.textAlign = "center";
    context.font = `900 408px Arial, sans-serif`;
    context.fillStyle = "rgba(165, 129, 96, 0.18)";
    context.fillText("SN0VV", CANVAS_WIDTH / 2 + 6, 496);
    context.fillStyle = CREAM;
    context.fillText("SN0VV", CANVAS_WIDTH / 2, 490);

    context.font = `600 28px ${MONO}`;
    context.fillStyle = GOLD_TEXT;
    context.textAlign = "left";
    context.fillText("IDEAS LIVE HERE.", 70, CANVAS_HEIGHT - 82);
    context.textAlign = "center";
    context.fillStyle = "rgba(243, 238, 226, 0.55)";
    context.font = `22px ${MONO}`;
    context.fillText("SELF-HOSTED TOWERS · LIVING HARBOR", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 82);
    context.fillStyle = GOLD_TEXT;
    context.font = `600 28px ${MONO}`;
    context.textAlign = "right";
    context.fillText("CODE / CREATE / EXPLORE", CANVAS_WIDTH - 70, CANVAS_HEIGHT - 82);
  };

  const drawAssets = (data: BoardData) => {
    drawChrome();
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 34px ${MONO}`;
    context.textAlign = "left";
    context.fillText("◆ SN0VV ASSET BOARD", 70, 98);
    context.font = `26px ${MONO}`;
    context.textAlign = "right";
    context.fillText(
      `更新 ${data.updatedAt || "--"} · 持仓 ${data.positions.length} 只`,
      CANVAS_WIDTH - 70,
      98
    );

    const rows = data.positions.slice(0, 4);
    context.textAlign = "left";
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 28px ${FONT}`;
    context.fillText("标的 / 名称", 70, 214);
    context.textAlign = "right";
    context.fillText("最新价", CANVAS_WIDTH - 480, 214);
    context.fillText("持仓涨跌", CANVAS_WIDTH - 70, 214);

    context.strokeStyle = "rgba(165, 129, 96, 0.28)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(70, 232);
    context.lineTo(CANVAS_WIDTH - 70, 232);
    context.stroke();

    rows.forEach((pos, index) => {
      const baseline = 304 + index * 76;
      if (index % 2 === 0) {
        context.fillStyle = "rgba(255, 255, 255, 0.022)";
        context.fillRect(70, baseline - 50, CANVAS_WIDTH - 140, 66);
      }
      context.textAlign = "left";
      context.fillStyle = GOLD_LINE;
      context.font = `600 24px ${MONO}`;
      context.fillText(`0${index + 1}`, 82, baseline - 6);
      context.fillStyle = CREAM;
      context.font = `bold 48px ${FONT}`;
      context.fillText(pos.name.slice(0, 8), 138, baseline);
      context.textAlign = "right";
      context.font = `bold 48px ${MONO}`;
      context.fillText(pos.price.toFixed(2), CANVAS_WIDTH - 480, baseline);
      const pct = pos.pnlPct;
      context.fillStyle = pct > 0 ? UP_COLOR : pct < 0 ? DOWN_COLOR : FLAT_COLOR;
      context.fillText(
        `${pct > 0 ? "▲" : pct < 0 ? "▼" : "—"} ${Math.abs(pct).toFixed(2)}%`,
        CANVAS_WIDTH - 70,
        baseline
      );
    });
    if (data.positions.length === 0) {
      context.fillStyle = CREAM;
      context.font = `bold 54px ${FONT}`;
      context.textAlign = "center";
      context.fillText("今日空仓 · 静待时机", CANVAS_WIDTH / 2, 396);
      context.fillStyle = GOLD_LINE;
      context.font = `24px ${MONO}`;
      context.fillText("WAITING FOR MARKET SETUP", CANVAS_WIDTH / 2, 444);
    }

    context.textAlign = "left";
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 36px ${MONO}`;
    context.fillText(
      `现金 ¥${data.cash.toLocaleString("zh-CN")}`,
      70,
      CANVAS_HEIGHT - 88
    );
    context.fillText(`总资产 ¥${data.totalValue.toLocaleString("zh-CN")}`, 70, CANVAS_HEIGHT - 40);
    context.textAlign = "right";
    const dayColor = data.dayPnl > 0 ? UP_COLOR : data.dayPnl < 0 ? DOWN_COLOR : GOLD_TEXT;
    context.fillStyle = dayColor;
    context.fillText(
      `今日盈亏 ¥${data.dayPnl >= 0 ? "+" : ""}${data.dayPnl.toLocaleString("zh-CN")}`,
      CANVAS_WIDTH - 70,
      CANVAS_HEIGHT - 64
    );
  };

  const redraw = () => {
    if (showBrand || !lastData) drawBrand();
    else drawAssets(lastData);
    texture.needsUpdate = true;
  };

  const switchTimer = setInterval(() => {
    showBrand = !showBrand;
    redraw();
  }, SWITCH_MS);

  drawBrand();

  return {
    texture,
    update: (data: BoardData | null) => {
      if (data) lastData = data;
      if (!showBrand) redraw();
    },
    dispose: () => {
      clearInterval(switchTimer);
      texture.dispose();
    },
  };
}
