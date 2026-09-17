import * as THREE from "three";

/** 滨海步道上的持仓行情大屏：Canvas 即屏面，独立于城市实例批次，自行管理行情与拾取。 */
export type BoardPosition = Readonly<{ name: string; price: number; pnlPct: number }>;
export type BoardData = Readonly<{
  updatedAt: string;
  positions: readonly BoardPosition[];
  cash: number;
  totalValue: number;
  dayPnl: number;
}>;
export type BoardState =
  | { kind: "connecting" }
  | { kind: "data"; data: BoardData }
  | { kind: "offline" };
export type QuantBoard = {
  group: THREE.Group;
  pickTarget: THREE.Object3D;
  setState: (state: BoardState) => void;
  dispose: () => void;
};

const UP_COLOR = "#ff5d55";
const DOWN_COLOR = "#2fe08d";
const FLAT_COLOR = "#9fbfae";
const AMBER = "#ffd66b";
const TEXT = "#eafff2";
const DIM = "#6fae8c";
const LABEL = "#4f8a6c";
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const MONO = '"SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 512;
const MAX_ROWS = 6;

// 大屏立于中央海岸公园北缘公路前（district中景视角的公园正后方），公园级地标大屏。
const BOARD_X = 28;
const BOARD_Z = 111;
const BOARD_ROTATION = 0;
const BOARD_CENTER_Y = 22;

/** 红涨绿跌：正收益红、负收益绿，两位小数内视为持平。 */
export function pnlColor(pct: number): string {
  const value = Math.round(pct * 100) / 100;
  return value > 0 ? UP_COLOR : value < 0 ? DOWN_COLOR : FLAT_COLOR;
}

export function pnlLabel(pct: number): string {
  const value = Math.round(pct * 100) / 100;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** 千分位金额；无效数值显示为占位符。 */
export function money(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 屏面一次最多排六行，余下持仓只报数量。 */
export function boardRows(
  positions: readonly BoardPosition[],
  max = MAX_ROWS,
): { rows: readonly BoardPosition[]; overflow: number } {
  return { rows: positions.slice(0, max), overflow: Math.max(0, positions.length - max) };
}

function finite(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? num : null;
}

/** 解析每五分钟导出的静态快照；结构不完整时返回 null，交由调用方按拉取失败处理。 */
export function parseSnapshot(value: unknown): BoardData | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.positions)) return null;
  const positions: BoardPosition[] = [];
  for (const item of source.positions) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const price = finite(entry.price);
    if (price === null) continue;
    const name = typeof entry.name === "string" && entry.name.trim() !== ""
      ? entry.name
      : typeof entry.code === "string" && entry.code.trim() !== ""
        ? entry.code
        : "未命名";
    positions.push({ name, price, pnlPct: finite(entry.pnlPct) ?? 0 });
  }
  return {
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
    positions,
    cash: finite(source.cash) ?? 0,
    totalValue: finite(source.totalValue) ?? 0,
    dayPnl: finite(source.dayPnl) ?? 0,
  };
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}…`;
}

function drawChrome(context: CanvasRenderingContext2D): void {
  const background = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  background.addColorStop(0, "#0c1811");
  background.addColorStop(0.55, "#08110c");
  background.addColorStop(1, "#060d09");
  context.fillStyle = background;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // LED 扫描线让深色底仍有屏体质感。
  context.fillStyle = "rgba(150, 255, 196, 0.03)";
  for (let y = 18; y < CANVAS_HEIGHT - 18; y += 5) context.fillRect(18, y, CANVAS_WIDTH - 36, 1.3);
  context.strokeStyle = "rgba(108, 240, 172, 0.28)";
  context.lineWidth = 2;
  context.strokeRect(14, 14, CANVAS_WIDTH - 28, CANVAS_HEIGHT - 28);
  context.strokeStyle = "rgba(255, 214, 107, 0.55)";
  context.lineWidth = 3;
  for (const [x, y, dx, dy] of [
    [14, 14, 1, 1], [CANVAS_WIDTH - 14, 14, -1, 1],
    [14, CANVAS_HEIGHT - 14, 1, -1], [CANVAS_WIDTH - 14, CANVAS_HEIGHT - 14, -1, -1],
  ] as const) {
    context.beginPath();
    context.moveTo(x + dx * 26, y);
    context.lineTo(x, y);
    context.lineTo(x, y + dy * 26);
    context.stroke();
  }
  context.fillStyle = AMBER;
  context.fillRect(36, 42, 9, 46);
  context.font = `bold 52px ${FONT}`;
  context.fillStyle = "#ffe9b3";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("SN0VV 资产大屏", 62, 86);
  context.strokeStyle = "rgba(112, 255, 178, 0.24)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(36, 112);
  context.lineTo(988, 112);
  context.stroke();
}

function drawData(context: CanvasRenderingContext2D, data: BoardData): void {
  const { rows, overflow } = boardRows(data.positions);
  context.textAlign = "right";
  context.font = `25px ${MONO}`;
  context.fillStyle = DIM;
  context.fillText(data.updatedAt ? `更新 ${data.updatedAt}` : "更新 --", 988, 58);
  context.font = `24px ${FONT}`;
  context.fillStyle = LABEL;
  context.fillText(`持仓 ${data.positions.length} 只${overflow > 0 ? ` · 屏显前 ${rows.length} 只` : ""}`, 988, 90);

  context.font = `bold 24px ${FONT}`;
  context.fillStyle = LABEL;
  context.textAlign = "left";
  context.fillText("名称", 36, 150);
  context.textAlign = "right";
  context.fillText("现价", 660, 150);
  context.fillText("涨跌幅", 988, 150);
  context.strokeStyle = "rgba(112, 255, 178, 0.12)";
  context.beginPath();
  context.moveTo(36, 162);
  context.lineTo(988, 162);
  context.stroke();

  rows.forEach((position, index) => {
    const baseline = 196 + index * 39;
    context.font = `bold 33px ${FONT}`;
    context.textAlign = "left";
    context.fillStyle = TEXT;
    context.fillText(fitText(context, position.name, 360), 36, baseline);
    context.font = `bold 33px ${MONO}`;
    context.textAlign = "right";
    context.fillStyle = "#dcf7e8";
    context.fillText(position.price.toFixed(2), 660, baseline);
    const pct = Math.round(position.pnlPct * 100) / 100;
    context.fillStyle = pnlColor(position.pnlPct);
    context.fillText(`${pct > 0 ? "▲" : pct < 0 ? "▼" : "—"} ${pnlLabel(position.pnlPct)}`, 988, baseline);
  });
  if (rows.length === 0) {
    context.textAlign = "center";
    context.font = `bold 40px ${FONT}`;
    context.fillStyle = "#7fb99a";
    context.fillText("今日空仓 · 静待时机", 512, 266);
    context.font = `22px ${MONO}`;
    context.fillStyle = LABEL;
    context.fillText("NO OPEN POSITIONS", 512, 300);
  }

  context.strokeStyle = "rgba(112, 255, 178, 0.18)";
  context.beginPath();
  context.moveTo(36, 410);
  context.lineTo(988, 410);
  context.stroke();
  let x = 36;
  const stat = (label: string, value: string, valueColor: string) => {
    context.textAlign = "left";
    context.font = `26px ${FONT}`;
    context.fillStyle = LABEL;
    context.fillText(label, x, 452);
    x += context.measureText(label).width + 12;
    context.font = `bold 34px ${MONO}`;
    context.fillStyle = valueColor;
    context.fillText(value, x, 452);
    x += context.measureText(value).width + 40;
  };
  stat("现金", `¥${money(data.cash)}`, AMBER);
  stat("总资产", `¥${money(data.totalValue)}`, AMBER);
  const day = Math.round(data.dayPnl * 100) / 100;
  const dayText = `${day > 0 ? "+" : day < 0 ? "-" : ""}¥${money(Math.abs(day))}`;
  context.textAlign = "right";
  context.font = `bold 34px ${MONO}`;
  context.fillStyle = pnlColor(day);
  context.fillText(dayText, 988, 452);
  context.font = `26px ${FONT}`;
  context.fillStyle = LABEL;
  context.fillText("今日盈亏", 988 - context.measureText(dayText).width - 14, 452);
}

function drawMessage(context: CanvasRenderingContext2D, connecting: boolean): void {
  context.textAlign = "center";
  context.font = `bold 46px ${FONT}`;
  context.fillStyle = connecting ? "#8fe6b5" : "#ffb35c";
  context.fillText(connecting ? "正在连接行情…" : "行情信号维护中", 512, 266);
  context.font = `24px ${MONO}`;
  context.fillStyle = LABEL;
  context.fillText(connecting ? "CONNECTING MARKET FEED" : "MARKET FEED OFFLINE", 512, 304);
}

function drawBoard(context: CanvasRenderingContext2D, state: BoardState): void {
  drawChrome(context);
  if (state.kind === "data") drawData(context, state.data);
  else drawMessage(context, state.kind === "connecting");
}

/** 屏面为自发光 LED 画质（toneMapped:false），支架仍受日夜光照影响。 */
export function createQuantBoard(): QuantBoard {
  const group = new THREE.Group();
  group.name = "Quant market board";
  group.position.set(BOARD_X, 0, BOARD_Z);
  group.rotation.y = BOARD_ROTATION;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#232b2d", roughness: 0.55, metalness: 0.4 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#3a4a41", roughness: 0.6, metalness: 0.25 });

  const frameGeometry = new THREE.BoxGeometry(45, 22.5, 1.8);
  const screenGeometry = new THREE.PlaneGeometry(42, 21);
  const crownGeometry = new THREE.BoxGeometry(46, 1.3, 2.2);
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.position.set(0, BOARD_CENTER_Y, 0);
  frame.castShadow = true;
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.set(0, BOARD_CENTER_Y, 0.95);
  group.add(frame, screen);
  const crown = new THREE.Mesh(crownGeometry, trimMaterial);
  crown.position.set(0, BOARD_CENTER_Y + 11.9, 0);
  crown.castShadow = true;
  group.add(crown);

  // 支脚：对齐 SN0VV 广告牌的三层立柱结构(金属柱/铜基座/混凝土垫)。
  const legMetalMaterial = new THREE.MeshStandardMaterial({ color: "#30383b", roughness: 0.55, metalness: 0.4 });
  const legCopperMaterial = new THREE.MeshStandardMaterial({ color: "#b28a60", roughness: 0.45, metalness: 0.45 });
  const legConcreteMaterial = new THREE.MeshStandardMaterial({ color: "#8a8f8c", roughness: 0.85, metalness: 0.05 });
  const legMetalGeometry = new THREE.BoxGeometry(1.15, 11.5, 1.15);
  const legCopperGeometry = new THREE.BoxGeometry(1.45, 0.4, 1.45);
  const legConcreteGeometry = new THREE.BoxGeometry(2.4, 1.2, 2.4);
  for (const side of [-1, 1]) {
    const metal = new THREE.Mesh(legMetalGeometry, legMetalMaterial);
    metal.position.set(side * 16, 5.75, -0.4);
    metal.castShadow = true;
    const copper = new THREE.Mesh(legCopperGeometry, legCopperMaterial);
    copper.position.set(side * 16, 11.7, -0.4);
    const concrete = new THREE.Mesh(legConcreteGeometry, legConcreteMaterial);
    concrete.position.set(side * 16, 0.6, -0.4);
    concrete.castShadow = true;
    group.add(metal, copper, concrete);
  }

  const setState = (state: BoardState) => {
    if (!context) return;
    drawBoard(context, state);
    texture.needsUpdate = true;
  };
  setState({ kind: "connecting" });

  return {
    group,
    // 点按以边框箱体为准，比屏面略大，手机上也容易命中。
    pickTarget: frame,
    setState,
    dispose: () => {
      texture.dispose();
      screenMaterial.dispose();
      frameMaterial.dispose();
      trimMaterial.dispose();
      frameGeometry.dispose();
      screenGeometry.dispose();
      crownGeometry.dispose();
      legMetalMaterial.dispose();
      legCopperMaterial.dispose();
      legConcreteMaterial.dispose();
      legMetalGeometry.dispose();
      legCopperGeometry.dispose();
      legConcreteGeometry.dispose();
      group.clear();
    },
  };
}
