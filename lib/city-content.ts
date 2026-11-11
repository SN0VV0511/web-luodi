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
export type BuildingFloor = Readonly<{
  floor: string;
  title: LocalizedText;
  category: LocalizedText;
  description: LocalizedText;
  href: string;
  /** 后台上传的第三方 HTML：iframe 必须加 sandbox，且不能与主站同源。 */
  sandboxed?: boolean;
}>;
export type CityPlace = Readonly<{
  id: PlaceId;
  number: string;
  name: string;
  category: LocalizedText;
  description: LocalizedText;
  color: string;
  href?: string;
  sourceHref?: string;
  floors?: readonly BuildingFloor[];
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
    // 环境变量优先；部署机上未注入时回退到站点公开路径，避免常住应用显示“待配置”。
    href: process.env.NEXT_PUBLIC_AFFINE_URL ?? "https://sn0vv.top/affine/",
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
> = {
  "slot-5": {
    name: "LunaTV",
    category: { zh: "影视剧场 · MEDIA STREAMING", en: "MEDIA STREAMING" },
    description: {
      zh: "自托管影视聚合服务，支持多源在线播放。",
      en: "Self-hosted media aggregation service with multi-source streaming.",
    },
    color: "#c08a97",
    href: "https://tv.sn0vv.top/",
  },
  "slot-6": {
    name: "LunaTV 源浏览器",
    category: { zh: "影视检索 · SOURCE BROWSER", en: "SOURCE BROWSER" },
    description: {
      zh: "按源搜索和浏览影视资源，快速定位想看的内容。",
      en: "Search and browse media sources, quickly find what you want to watch.",
    },
    color: "#94a7c4",
    href: "https://sn0vv.top/sources/",
  },
  "slot-7": {
    name: "微信推送",
    category: { zh: "消息驿站 · WECHAT PUSH", en: "WECHAT PUSH" },
    description: {
      zh: "新闻、量化盯盘与告警的微信推送通道，掉线后扫码一键恢复。",
      en: "WeChat push channel for news, quant alerts and daily reports. Scan to re-link when the session drops.",
    },
    color: "#85ab90",
    href: "https://sn0vv.top/wxqr/",
  },
  "slot-8": {
    name: "技术手稿馆",
    category: {
      zh: "多楼层展馆 · HTML ARCHIVE TOWER",
      en: "HTML ARCHIVE TOWER",
    },
    description: {
      zh: "按楼层收录工程架构全景手稿与微调实验记录的展馆大楼，选择对应楼层即可进入查阅。",
      en: "A multi-floor archive tower housing interactive architecture handbooks and fine-tuning labs. Select a floor to enter.",
    },
    color: "#6b92b5",
    floors: [
      {
        floor: "1F",
        title: {
          zh: "Biglink 财税多智能体系统",
          en: "Biglink FinTax Multi-Agent",
        },
        category: {
          zh: "项目简介 · 架构与面试全景手册",
          en: "PROJECT INTRO · ARCHITECTURE HANDBOOK",
        },
        description: {
          zh: "基于本地微调 Gemma 与云端大模型混合路由的六域财税多智能体平台。",
          en: "Six-domain FinTax multi-agent platform with hybrid local Gemma and cloud LLM routing.",
        },
        href: "/biglink/index.html",
      },
      {
        floor: "2F",
        title: {
          zh: "LoRA 微调记录课堂",
          en: "LoRA Fine-Tuning Classroom",
        },
        category: {
          zh: "微调记录 · 公式拆解与逐段代码",
          en: "FINE-TUNING LOG · MATH & CODE",
        },
        description: {
          zh: "Gemma QLoRA 微调实验复盘、中文术语点读、低秩矩阵推导与逐段代码实现。",
          en: "Interactive Gemma QLoRA fine-tuning log with term explanations, matrix math, and code walkthroughs.",
        },
        href: "/lora/index.html",
      },
    ],
  },
};

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

/** 只允许浏览器可安全打开的同源根路径或 HTTP(S) 地址。 */
export function safeAppUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\s\\]/.test(value)) {
    return value;
  }
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
