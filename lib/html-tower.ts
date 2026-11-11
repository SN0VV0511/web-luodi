import type { ArchiveUploadedFloor } from "./archive-tower-annex";
import type { BuildingFloor } from "./city-content";

/** html-tower 容器（/opt/html-tower）公开的只读接口；上传/删除在 /tower-admin/ 后台完成。 */
export const TOWER_API_URL = process.env.NEXT_PUBLIC_TOWER_API ?? "/tower/api/pages";
export const TOWER_POLL_MS = 60_000;
/** 内置楼层（1F Biglink、2F LoRA）之后，上传页面从第 3 层开始。 */
export const BUILTIN_FLOOR_COUNT = 2;

export type TowerPage = Readonly<{
  id: string;
  title: string;
  filename: string;
  size: number;
  createdAt: string;
  url: string;
}>;

const ID_RE = /^[a-f0-9]{12}$/;

/** 只接受形状正确、指向 /tower/p/<id>.html 的条目，防止接口异常时把任意地址塞进 iframe。 */
export function parseTowerPages(data: unknown): TowerPage[] {
  const list = (data as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(list)) return [];
  const pages: TowerPage[] = [];
  for (const item of list.slice(0, 80)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!ID_RE.test(id)) continue;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : id;
    pages.push({
      id,
      title,
      filename: typeof raw.filename === "string" ? raw.filename.slice(0, 120) : `${id}.html`,
      size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      url: `/tower/p/${id}.html`,
    });
  }
  return pages;
}

export async function fetchTowerPages(signal?: AbortSignal): Promise<TowerPage[]> {
  const res = await fetch(TOWER_API_URL, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTowerPages(await res.json());
}

function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function towerFloorCode(pageIndex: number): string {
  return `${pageIndex + BUILTIN_FLOOR_COUNT + 1}F`;
}

/** 上传页面 → 楼层导览/全息屏使用的楼层数据。 */
export function towerPagesToFloors(pages: readonly TowerPage[]): BuildingFloor[] {
  return pages.map((page, index) => {
    const day = formatDay(page.createdAt);
    return {
      floor: towerFloorCode(index),
      title: { zh: page.title, en: page.title },
      category: { zh: "上传页面 · HTML PAGE", en: "UPLOADED HTML PAGE" },
      description: {
        zh: `${page.filename}${day ? ` · ${day} 上传` : ""}`,
        en: `${page.filename}${day ? ` · uploaded ${day}` : ""}`,
      },
      href: page.url,
      sandboxed: true,
    };
  });
}

/** 上传页面 → 3D 大楼加建楼层。 */
export function towerPagesToArchiveFloors(pages: readonly TowerPage[]): ArchiveUploadedFloor[] {
  return pages.map((page, index) => ({
    id: page.id,
    code: towerFloorCode(index),
    title: page.title,
    subtitle: `${page.filename.toUpperCase()} · HTML PAGE${formatDay(page.createdAt) ? ` · ${formatDay(page.createdAt)}` : ""}`,
  }));
}
