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
    const background = context.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    background.addColorStop(0, "#263034");
    background.addColorStop(0.55, "#11191e");
    background.addColorStop(1, "#1d2529");
    context.fillStyle = background;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.strokeStyle = GOLD_LINE;
    context.lineWidth = 3;
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
    context.font = `30px ${MONO}`;
    context.textAlign = "left";
    context.fillText("A PERSONAL CITY", 70, 105);
    context.textAlign = "right";
    context.fillText("EST. 2026 / VOL. 01", CANVAS_WIDTH - 70, 105);
    context.textAlign = "center";
    context.fillStyle = CREAM;
    context.font = `900 430px Arial, sans-serif`;
    context.fillText("SN0VV", CANVAS_WIDTH / 2, 500);
    context.font = `30px ${MONO}`;
    context.fillStyle = GOLD_TEXT;
    context.textAlign = "left";
    context.fillText("IDEAS LIVE HERE.", 70, CANVAS_HEIGHT - 90);
    context.textAlign = "right";
    context.fillText("CODE / CREATE / EXPLORE", CANVAS_WIDTH - 70, CANVAS_HEIGHT - 90);
  };

  const drawAssets = (data: BoardData) => {
    drawChrome();
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 34px ${MONO}`;
    context.textAlign = "left";
    context.fillText("◆ SN0VV ASSET BOARD", 70, 105);
    context.font = `26px ${MONO}`;
    context.textAlign = "right";
    context.fillText(
      `更新 ${data.updatedAt || "--"} · 持仓 ${data.positions.length} 只`,
      CANVAS_WIDTH - 70,
      105
    );

    const rows = data.positions.slice(0, 4);
    context.textAlign = "left";
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 30px ${FONT}`;
    context.fillText("名称", 70, 250);
    context.textAlign = "right";
    context.fillText("现价", CANVAS_WIDTH - 480, 250);
    context.fillText("涨跌幅", CANVAS_WIDTH - 70, 250);

    rows.forEach((pos, index) => {
      const baseline = 350 + index * 82;
      context.textAlign = "left";
      context.fillStyle = CREAM;
      context.font = `bold 52px ${FONT}`;
      context.fillText(pos.name.slice(0, 8), 70, baseline);
      context.textAlign = "right";
      context.font = `bold 52px ${MONO}`;
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
      context.font = `bold 56px ${FONT}`;
      context.textAlign = "center";
      context.fillText("今日空仓 · 静待时机", CANVAS_WIDTH / 2, 420);
    }

    context.textAlign = "left";
    context.fillStyle = GOLD_TEXT;
    context.font = `bold 38px ${MONO}`;
    context.fillText(
      `现金 ¥${data.cash.toLocaleString("zh-CN")}`,
      70,
      CANVAS_HEIGHT - 90
    );
    context.fillText(`总资产 ¥${data.totalValue.toLocaleString("zh-CN")}`, 70, CANVAS_HEIGHT - 40);
    context.textAlign = "right";
    context.fillText(
      `今日盈亏 ¥${data.dayPnl >= 0 ? "+" : ""}${data.dayPnl.toLocaleString("zh-CN")}`,
      CANVAS_WIDTH - 70,
      CANVAS_HEIGHT - 65
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
