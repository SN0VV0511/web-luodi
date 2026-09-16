import type { LocalizedText } from "./site-content";

export type PlaceId =
  | "quant"
  | "affine"
  | "agents"
  | "openclaw"
  | "news"
  | "guestbook"
  | "about"
  | `slot-${number}`;
export type CityPlace = Readonly<{
  id: PlaceId;
  number: string;
  name: string;
  category: LocalizedText;
  description: LocalizedText;
  color: string;
  href?: string;
  sourceHref?: string;
  vacant?: boolean;
}>;

/** 部署入口集中配置；未配置时只展示详情，不冒充线上服务。 */
export const cityPlaces: readonly CityPlace[] = [
  {
    id: "quant",
    number: "01",
    name: "慢慢事务所",
    category: {
      zh: "量化交易 · QUANT A-STOCK",
      en: "QUANT A-STOCK · MARKET OFFICE",
    },
    description: {
      zh: "让策略在自己的节奏里生长。一间研究市场、观察数据的三维量化事务所。",
      en: "A little 3D office for market research, data, and strategies that grow at their own pace.",
    },
    color: "#e4774e",
    href: process.env.NEXT_PUBLIC_QUANT_URL,
    sourceHref: "https://github.com/SN0VV0511/quant-a-stock",
  },
  {
    id: "affine",
    number: "02",
    name: "AFFiNE",
    category: { zh: "知识工作室 · KNOWLEDGE STUDIO", en: "KNOWLEDGE STUDIO" },
    description: {
      zh: "文档、白板与灵感住在同一栋楼。给想法一个可以自由生长的地方。",
      en: "Documents, whiteboards, and ideas share a home. A studio for thinking freely.",
    },
    color: "#729582",
    href: process.env.NEXT_PUBLIC_AFFINE_URL,
  },
  {
    id: "agents",
    number: "03",
    name: "Agent Base",
    category: {
      zh: "智能体总部 · AGENT HEADQUARTERS",
      en: "AGENT HEADQUARTERS",
    },
    description: {
      zh: "连接模型、MCP 工具与个人自动化。让小小的智能体，完成真正有用的工作。",
      en: "A home for models, MCP tools, and personal automation that does useful work.",
    },
    color: "#758da8",
    href: process.env.NEXT_PUBLIC_AGENTS_URL,
  },
  {
    id: "openclaw",
    number: "04",
    name: "OpenClaw",
    category: {
      zh: "实验工坊 · EXPERIMENT WORKSHOP",
      en: "EXPERIMENT WORKSHOP",
    },
    description: {
      zh: "从一个念头到一次真实行动。把工具与实验连接起来的创作工坊。",
      en: "From an idea to a real action. A workshop connecting tools and experiments.",
    },
    color: "#c2a76b",
    href: process.env.NEXT_PUBLIC_OPENCLAW_URL,
  },
];

/** 给 slot-5 至 slot-12 填写租户即可入驻，三维标牌和应用目录会同步更新。 */
export const officeTenants: Partial<
  Record<`slot-${number}`, Omit<CityPlace, "id" | "number" | "vacant">>
> = {};

/** 预留楼与正式项目共用数据，避免模型与跳转目录各自维护。 */
export const cityBuildings: readonly CityPlace[] = [
  ...cityPlaces,
  ...Array.from(
    { length: 8 },
    (_, index): CityPlace => ({
      id: `slot-${index + 5}`,
      number: String(index + 5).padStart(2, "0"),
      name: `Office ${String(index + 5).padStart(2, "0")}`,
      category: { zh: "预留办公楼 · AVAILABLE SPACE", en: "AVAILABLE SPACE" },
      description: {
        zh: "下一次灵感，已经有了地址。这里为未来的新应用留了一盏灯。",
        en: "Your next idea already has an address. A light left on for something new.",
      },
      color: ["#a7a48d", "#b6a399", "#9aa8a2", "#b0a27d"][index % 4],
      ...officeTenants[`slot-${index + 5}`],
      vacant: !officeTenants[`slot-${index + 5}`],
    }),
  ),
];

/** 只允许浏览器可安全打开的 HTTP(S) 地址。 */
export function safeAppUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
