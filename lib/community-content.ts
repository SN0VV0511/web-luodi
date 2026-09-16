import { safeAppUrl } from "./city-content";
import type { LocalizedText } from "./site-content";

/** 公共内容入口；未配置时保留阅读精选和本地草稿。 */
export const communityLinks = {
  news: safeAppUrl(process.env.NEXT_PUBLIC_NEWS_URL),
  guestbook: safeAppUrl(process.env.NEXT_PUBLIC_GUESTBOOK_URL),
};

export const readingList: readonly {
  title: LocalizedText;
  description: LocalizedText;
  category: LocalizedText;
  href: string;
}[] = [
  {
    title: { zh: "走进慢慢事务所", en: "Inside Market Office" },
    description: {
      zh: "从策略到三维办公室，看看量化项目的源码与记录。",
      en: "Explore the code behind a little office for market research.",
    },
    category: { zh: "项目手记", en: "PROJECT NOTES" },
    href: "https://github.com/SN0VV0511/quant-a-stock",
  },
  {
    title: {
      zh: "在浏览器里，造一个世界",
      en: "Build a world in your browser",
    },
    description: {
      zh: "来自 Three.js 的三维作品、示例与创作灵感。",
      en: "3D experiments, examples, and inspiration from Three.js.",
    },
    category: { zh: "三维灵感", en: "3D INSPIRATION" },
    href: "https://threejs.org/",
  },
  {
    title: { zh: "给想法一张没有边界的纸", en: "A canvas without edges" },
    description: {
      zh: "在 AFFiNE 里连接文档、白板与那些尚未成形的念头。",
      en: "Connect documents, whiteboards, and unfinished ideas with AFFiNE.",
    },
    category: { zh: "工作方式", en: "WAYS OF WORKING" },
    href: "https://affine.pro/",
  },
];

export const GUESTBOOK_DRAFT_KEY = "sn0vv-city-guestbook-draft";
export const GUESTBOOK_NAME_LIMIT = 40;
export const GUESTBOOK_MESSAGE_LIMIT = 280;
export type GuestbookDraft = Readonly<{ name: string; message: string }>;

/** 校验浏览器中不受信任的草稿；不改写无法识别的已有记录。 */
export function parseGuestbookDraft(value: unknown): GuestbookDraft | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("name" in value) ||
    !("message" in value)
  )
    return null;
  const { name, message } = value;
  if (
    typeof name !== "string" ||
    typeof message !== "string" ||
    name.length > GUESTBOOK_NAME_LIMIT ||
    message.length > GUESTBOOK_MESSAGE_LIMIT
  )
    return null;
  return { name, message };
}
