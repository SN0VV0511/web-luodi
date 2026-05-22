export type Locale = "zh" | "en";

export type LocalizedText = Readonly<Record<Locale, string>>;

export type ShowcaseItem = Readonly<{
  title: string;
  description: LocalizedText;
  image: "openclaw" | "affine" | "agentBase";
  tone: "wave" | "graph" | "voice";
}>;

export type InfoItem = Readonly<{
  title: LocalizedText;
  description: LocalizedText;
  detail: LocalizedText;
}>;

export const localeLabels: Readonly<Record<Locale, string>> = {
  zh: "简体中文",
  en: "English",
};

export const heroCopy = {
  eyebrow: {
    zh: "个人智能实验室",
    en: "Personal intelligence lab",
  },
  title: {
    zh: "你好，我是 SN0VV",
    en: "HELLO, I'M SN0VV",
  },
  aboutAction: {
    zh: "关于我",
    en: "About me",
  },
  closeAction: {
    zh: "返回",
    en: "Back",
  },
} satisfies Record<string, LocalizedText>;

export const aboutParagraphs: Readonly<Record<Locale, readonly string[]>> = {
  zh: [
    "欢迎来到我的主页。这里记录我如何把模型、工具和真实世界的动作连接成可落地的系统。",
    "我关心能被验证的智能：从多模态感知、本地智能体编排到可维护的工程界面，让实验不只停在演示阶段。",
    "这个页面既是项目入口，也是持续更新的工作台。我会在这里展示自托管玩具、工程笔记和下一步想探索的问题。",
  ],
  en: [
    "Welcome to my homepage. This is where I connect models, tools, and real-world actions into systems that can ship.",
    "I care about intelligence that can be verified: multimodal perception, local agent orchestration, and maintainable interfaces beyond a demo.",
    "This page is both a project index and a living workbench for self-hosted toys, engineering notes, and the questions I want to explore next.",
  ],
};

export const showcaseItems: readonly ShowcaseItem[] = [
  {
    title: "openclaw",
    description: {
      zh: "用视觉语言智能体驱动物理机械手爪。",
      en: "Control real robotic claws through vision-language agents.",
    },
    image: "openclaw",
    tone: "wave",
  },
  {
    title: "AFFiNE",
    description: {
      zh: "融合文档、白板与看板的协同知识工作区。",
      en: "A collaborative workspace for docs, boards, and canvases.",
    },
    image: "affine",
    tone: "graph",
  },
  {
    title: "SN0VV Agent Base",
    description: {
      zh: "编排本地模型、MCP 工具与个人自动化。",
      en: "Orchestrate local models, MCP tools, and personal automation.",
    },
    image: "agentBase",
    tone: "voice",
  },
];

export const profileItems: readonly InfoItem[] = [
  {
    title: {
      zh: "全栈工程",
      en: "Full-stack engineering",
    },
    description: {
      zh: "把模型能力拆成可维护的界面、服务与自动化。",
      en: "Turn model capabilities into maintainable interfaces, services, and automation.",
    },
    detail: {
      zh: "产品与系统",
      en: "Product systems",
    },
  },
  {
    title: {
      zh: "智能体实验",
      en: "Agent experiments",
    },
    description: {
      zh: "关注工具调用、多模态输入和长任务协作体验。",
      en: "Explore tool use, multimodal input, and long-horizon collaboration.",
    },
    detail: {
      zh: "原型验证",
      en: "Prototyping",
    },
  },
];

export const focusItems: readonly InfoItem[] = [
  {
    title: { zh: "真实交互", en: "Real interaction" },
    description: {
      zh: "让智能能力进入网页、桌面工具与物理设备。",
      en: "Bring intelligence into web pages, desktop tools, and physical devices.",
    },
    detail: {
      zh: "界面 / 设备",
      en: "UI / devices",
    },
  },
  {
    title: { zh: "本地优先", en: "Local first" },
    description: {
      zh: "偏好自托管、清晰边界和能长期维护的工具链。",
      en: "Prefer self-hosted tools, clear boundaries, and maintainable stacks.",
    },
    detail: {
      zh: "自托管",
      en: "Self-hosted",
    },
  },
  {
    title: { zh: "工程表达", en: "Engineering craft" },
    description: {
      zh: "用代码、交互和文档把复杂问题讲清楚。",
      en: "Explain complex problems through code, interaction, and writing.",
    },
    detail: {
      zh: "代码 / 写作",
      en: "Code / writing",
    },
  },
];

/**
 * 读取双语文本，集中处理语言映射避免组件分支重复。
 *
 * @param copy - 双语文本。
 * @param locale - 当前语言。
 * @returns 当前语言的文本。
 */
export function pickLocale(copy: LocalizedText, locale: Locale): string {
  return copy[locale];
}

/**
 * 生成 MiMo 风格的两位序号。
 *
 * @param index - 从零开始的数组下标。
 * @returns 从 01 开始的序号。
 * @throws 当下标不是非负整数时抛出异常。
 */
export function formatListIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`列表下标必须是非负整数，当前值为 ${index}`);
  }

  return String(index + 1).padStart(2, "0");
}
