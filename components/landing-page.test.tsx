import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PlaceId } from "@/lib/city-content";
import { LandingPage } from "@/components/landing-page";

const { sceneProps } = vi.hoisted(() => ({ sceneProps: vi.fn() }));
type MockSceneProps = {
  onSelect: (id: PlaceId) => void;
  onZoomChange: (zoom: number) => void;
  selected: PlaceId | null;
  selectionKey: number;
  night: boolean;
  paused: boolean;
  resetKey: number;
  zoom: number;
  locale: "zh" | "en";
  view: "aerial" | "district" | "street";
  touring: boolean;
  labelsVisible: boolean;
  focusPoint?: { x: number; z: number; distance?: number; height?: number };
  information?: ReactNode;
};

vi.mock("next/dynamic", () => ({
  default: () => (props: MockSceneProps) => {
    sceneProps(props);
    return (
      <div>
        <button onClick={() => props.onSelect("quant")}>选择量化建筑</button>
        <button onClick={() => props.onSelect("news")}>选择新闻建筑</button>
        <button onClick={() => props.onSelect("guestbook")}>选择留言建筑</button>
        <button onClick={() => props.onZoomChange(2.8)}>场景滚轮放大至上限</button>
        {props.information}
      </div>
    );
  },
}));
vi.mock("@/components/community-panels", () => ({
  CommunityPanels: () => (
    <>
      <section aria-label="新闻内容" />
      <section aria-label="留言内容" />
    </>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function openDirectory() {
  fireEvent.click(screen.getByRole("button", { name: /^应用目录/ }));
  return within(screen.getByRole("complementary", { name: "应用目录" }));
}

describe("城市主页", () => {
  it("目录按需打开并聚焦，支持状态筛选、大小写搜索与空结果恢复", () => {
    render(<LandingPage />);
    expect(screen.queryByRole("complementary", { name: "应用目录" })).not.toBeInTheDocument();
    const directory = openDirectory();
    const search = directory.getByRole("textbox", { name: "搜索应用" });
    expect(search).toHaveFocus();
    expect(directory.getAllByRole("button", { name: /^探索 / })).toHaveLength(12);
    fireEvent.change(search, { target: { value: "  affINE  " } });
    expect(directory.getByRole("button", { name: "探索 AFFiNE" })).toBeInTheDocument();
    expect(directory.queryByRole("button", { name: "探索 Agent Base" })).not.toBeInTheDocument();

    fireEvent.click(directory.getByRole("button", { name: /^预留空间/ }));
    expect(directory.getByRole("status")).toHaveTextContent("没有找到这栋楼");
    fireEvent.click(directory.getByRole("button", { name: "清除搜索" }));
    expect(directory.getAllByRole("button", { name: /^探索 / })).toHaveLength(4);
    expect(directory.getByRole("button", { name: "探索 Office 12" })).toBeInTheDocument();
    expect(directory.queryByRole("button", { name: "探索 AFFiNE" })).not.toBeInTheDocument();

    fireEvent.click(directory.getByRole("button", { name: /^已入驻/ }));
    expect(directory.getAllByRole("button", { name: /^探索 / })).toHaveLength(8);
    fireEvent.change(search, { target: { value: "03" } });
    expect(directory.getByRole("button", { name: "探索 Agent Base" })).toBeInTheDocument();
    fireEvent.click(directory.getByRole("button", { name: "关闭应用目录" }));
    expect(screen.queryByRole("complementary", { name: "应用目录" })).not.toBeInTheDocument();
  });

  it("多楼层大楼点开后展示楼层导览、电梯搜索与上下滑动 HTML 展厅", () => {
    render(<LandingPage />);
    const directory = openDirectory();
    fireEvent.click(directory.getByRole("button", { name: "探索 技术手稿馆" }));
    const detail = screen.getByRole("complementary", { name: "建筑详情" });
    expect(within(detail).getByRole("heading", { name: "技术手稿馆" })).toBeInTheDocument();
    const floors = within(detail).getByRole("region", { name: "楼层导览" });
    const links = within(floors).getAllByRole("link");
    expect(links).toHaveLength(2);
    // 建筑立面从顶层(2F)向下排列到底层(1F)
    expect(links[0]).toHaveAttribute("href", "/lora/index.html");
    expect(links[0]).toHaveTextContent("2F");
    expect(links[0]).toHaveTextContent("LoRA 微调记录课堂");
    expect(links[1]).toHaveAttribute("href", "/biglink/index.html");
    expect(links[1]).toHaveTextContent("1F");
    expect(links[1]).toHaveTextContent("Biglink 财税多智能体系统");

    // 电梯搜索直达对应楼层 HTML
    const elevatorInput = within(detail).getByRole("textbox", { name: "电梯搜索直达" });
    fireEvent.change(elevatorInput, { target: { value: "LoRA" } });
    fireEvent.click(within(detail).getByRole("button", { name: "电梯直达" }));
    expect(within(detail).getByRole("status")).toHaveTextContent("⚡ 电梯已直达 2F · LoRA 微调记录课堂");
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "slot-8", activeFloorIndex: 1 });
  });

  it("技术手稿馆运行时拉取后台上传的 HTML，接在 2F 之后续楼层并以沙箱 iframe 展示", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        pages: [
          { id: "a1b2c3d4e5f6", title: "季度复盘", filename: "review.html", size: 2048, createdAt: "2026-11-11T15:00:00+0800", url: "/tower/p/a1b2c3d4e5f6.html" },
          { id: "bad id", title: "非法条目", filename: "x.html", size: 1, createdAt: "", url: "https://evil.example/" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<LandingPage />);
      const directory = openDirectory();
      fireEvent.click(directory.getByRole("button", { name: "探索 技术手稿馆" }));
      const detail = screen.getByRole("complementary", { name: "建筑详情" });
      const floors = within(detail).getByRole("region", { name: "楼层导览" });
      const uploaded = await within(floors).findByRole("link", { name: "3F 季度复盘" });
      expect(uploaded).toHaveAttribute("href", "/tower/p/a1b2c3d4e5f6.html");
      expect(within(floors).getAllByRole("link")).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledWith("/tower/api/pages", expect.anything());
      const frame = detail.querySelector('iframe[src="/tower/p/a1b2c3d4e5f6.html"]');
      expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");
      expect(detail.querySelector('iframe[src="/lora/index.html"]')).not.toHaveAttribute("sandbox");
      expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
        archiveFloors: [{ id: "a1b2c3d4e5f6", code: "3F", title: "季度复盘" }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("三维建筑与目录共用聚焦详情，空办公室没有伪造应用入口", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "选择量化建筑" }));
    const detail = screen.getByRole("complementary", { name: "建筑详情" });
    expect(detail).toHaveFocus();
    expect(within(detail).getByRole("heading", { name: "慢慢事务所" })).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /查看源码/ })).toHaveAttribute(
      "href", "https://github.com/SN0VV0511/quant-a-stock",
    );
    expect(within(detail).queryByRole("link", { name: /进入应用/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭建筑详情" }));
    expect(screen.queryByRole("complementary", { name: "建筑详情" })).not.toBeInTheDocument();

    const directory = openDirectory();
    fireEvent.click(directory.getByRole("button", { name: "探索 Office 12" }));
    const vacantDetail = screen.getByRole("complementary", { name: "建筑详情" });
    expect(screen.queryByRole("complementary", { name: "应用目录" })).not.toBeInTheDocument();
    expect(vacantDetail).toHaveTextContent("这栋楼，留给下一个新想法");
    expect(within(vacantDetail).queryByRole("link")).not.toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "slot-12" });
    expect(vacantDetail).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "建筑详情" })).not.toBeInTheDocument();
  });

  it("昼夜、暂停、楼牌和双向缩放保持一致，按钮限制缩放范围", () => {
    render(<LandingPage />);
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
      night: false, paused: false, labelsVisible: true, zoom: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "切换到夜景" }));
    fireEvent.click(screen.getByRole("button", { name: "暂停城市动画" }));
    fireEvent.click(screen.getByRole("button", { name: "显示楼牌" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
      night: true, paused: true, labelsVisible: false,
    });
    expect(screen.getByRole("button", { name: "播放城市动画" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "场景滚轮放大至上限" }));
    expect(screen.getByRole("button", { name: "放大" })).toBeDisabled();
    for (let i = 0; i < 15; i++) fireEvent.click(screen.getByRole("button", { name: "缩小" }));
    expect(screen.getByRole("button", { name: "缩小" })).toBeDisabled();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ zoom: 0.6 });
    for (let i = 0; i < 15; i++) fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByRole("button", { name: "放大" })).toBeDisabled();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ zoom: 2.8 });
    fireEvent.click(screen.getByRole("button", { name: "切换到黄昏" }));
    fireEvent.click(screen.getByRole("button", { name: "播放城市动画" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ night: false, paused: false });
  });

  it("三个视角与航拍可切换，选楼停止航拍，重置恢复城市总览", () => {
    render(<LandingPage />);
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ view: "aerial", touring: false, resetKey: 0 });
    fireEvent.click(screen.getByRole("button", { name: "街区近景" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ view: "district" });
    fireEvent.click(screen.getByRole("button", { name: "街道视角" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ view: "street" });
    fireEvent.click(screen.getByRole("button", { name: "暂停城市动画" }));
    fireEvent.click(screen.getByRole("button", { name: "自动航拍" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ touring: true, paused: false });
    fireEvent.click(screen.getByRole("button", { name: "选择量化建筑" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "quant", touring: false });
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    fireEvent.click(screen.getByRole("button", { name: "重置视角" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
      selected: null, zoom: 1, view: "aerial", touring: false, resetKey: 1,
    });
    expect(screen.getByRole("button", { name: "城市俯瞰" })).toHaveAttribute("aria-pressed", "true");
  });

  it("总览关闭浮层并清除地图定位，重复点击当前视角仍可复位相机", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "在小地图上定位" }), { detail: 0 });
    openDirectory();
    fireEvent.click(screen.getByRole("button", { name: "城市总览" }));
    expect(screen.queryByRole("complementary", { name: "应用目录" })).not.toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
      selected: null, focusPoint: undefined, view: "aerial", resetKey: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "城市俯瞰" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ view: "aerial", resetKey: 2 });
    fireEvent.click(screen.getByRole("button", { name: "街区近景" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ view: "district", resetKey: 2 });
  });

  it("切换语言同步页面与场景，关于入口聚焦广告牌并展示非模态信息", () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to English" }));
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { name: "Welcome to my city." })).toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ locale: "en" });
    fireEvent.click(screen.getByRole("button", { name: "About the builder" }));
    const information = screen.getByRole("dialog", { name: "About SN0VV" });
    expect(information).toHaveAttribute("aria-modal", "false");
    expect(information).toHaveClass("panel-about");
    expect(information.tagName).toBe("SECTION");
    expect(within(information).getByRole("heading", { name: "Full-stack engineering" })).toBeInTheDocument();
    expect(within(information).getByRole("link", { name: /Explore on GitHub/ })).toHaveAttribute("href", "https://github.com/SN0VV0511");
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "about", selectionKey: 1, touring: false });
    fireEvent.click(screen.getByRole("button", { name: "About the builder" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "about", selectionKey: 2, touring: false });
    expect(screen.getAllByRole("dialog", { name: "About SN0VV" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: null, information: null });
    fireEvent.click(screen.getByRole("button", { name: "切换到中文" }));
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("公共建筑展示场景内信息，关闭与 Escape 都清除选择并归还焦点", () => {
    render(<LandingPage />);
    const newsTrigger = screen.getByRole("button", { name: "选择新闻建筑" });
    newsTrigger.focus();
    fireEvent.click(newsTrigger);
    const news = screen.getByRole("dialog", { name: "城市日报" });
    expect(news).toHaveClass("panel-news");
    expect(news).toHaveAttribute("aria-modal", "false");
    expect(within(news).getByRole("region", { name: "新闻内容" })).toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "news", touring: false });
    fireEvent.click(screen.getByRole("button", { name: "关闭面板" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: null, information: null });
    expect(newsTrigger).toHaveFocus();
    const guestbookTrigger = screen.getByRole("button", { name: "选择留言建筑" });
    guestbookTrigger.focus();
    fireEvent.click(guestbookTrigger);
    expect(screen.getByRole("dialog", { name: "海岸信箱" })).toHaveClass("panel-guestbook");
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "guestbook", touring: false });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: null, information: null });
    expect(guestbookTrigger).toHaveFocus();
  });

  it("小地图支持键盘定位，点击边缘不会定位到地图范围之外", () => {
    render(<LandingPage />);
    const minimap = screen.getByRole("button", { name: "在小地图上定位" });
    fireEvent.click(minimap, { detail: 0 });
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ focusPoint: { x: 0, z: 0 } });
    vi.spyOn(minimap, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 100, left: 100, top: 100, right: 300, bottom: 300,
      width: 200, height: 200, toJSON: () => ({}),
    });
    fireEvent.click(minimap, { detail: 1, clientX: 99, clientY: 301 });
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ focusPoint: { x: -240, z: 350 } });
  });

  it("选楼不自动打开新窗口，三段机构与重播传给同一场景，应用由原生链接打开", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<LandingPage />);
    const directory = openDirectory();
    fireEvent.click(directory.getByRole("button", { name: "探索 AFFiNE" }));
    const detail = screen.getByRole("complementary", { name: "建筑详情" });
    expect(open).not.toHaveBeenCalled();
    expect(detail).toHaveClass("is-landmark-rig");
    expect(within(detail).getByRole("link", { name: /打开 AFFiNE/ })).toHaveAttribute("href", "https://sn0vv.top/affine/");
    expect(within(detail).getByRole("link", { name: /打开 AFFiNE/ })).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(within(detail).getByRole("button", { name: /展开白板/ }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "affine", experienceChapter: 1 });
    expect(within(detail).getByRole("button", { name: /展开白板/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(detail).getByRole("button", { name: /灵感花园/ }));
    fireEvent.click(within(detail).getByRole("button", { name: "重新演示建筑机构" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ experienceChapter: 2, experienceReplayKey: 1 });
    fireEvent.click(within(detail).getByRole("button", { name: "返回城市" }));
    expect(screen.getByRole("button", { name: "应用" })).toHaveFocus();
    const nextDirectory = openDirectory();
    fireEvent.click(nextDirectory.getByRole("button", { name: "探索 OpenClaw" }));
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({ selected: "openclaw", experienceChapter: 0, experienceReplayKey: 0 });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("切换语言保留当前建筑章节，并使用相应语言的入口和说明", () => {
    render(<LandingPage />);
    const directory = openDirectory();
    fireEvent.click(directory.getByRole("button", { name: "探索 LunaTV" }));
    fireEvent.click(screen.getByRole("button", { name: /放映视角/ }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to English" }));
    const detail = screen.getByRole("complementary", { name: "Building details" });
    expect(within(detail).getByRole("button", { name: /Projection room/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(detail).getByRole("link", { name: /Choose a film in LunaTV/ })).toHaveAttribute("href", "https://tv.sn0vv.top/");
    expect(detail).toHaveTextContent("local geometry, not an external video");
  });

  it("街区入口走近公园生活场景并关闭应用浮层", () => {
    render(<LandingPage />);
    openDirectory();
    fireEvent.click(screen.getByRole("button", { name: "中央公园" }));
    expect(screen.queryByRole("complementary", { name: "应用目录" })).not.toBeInTheDocument();
    expect(sceneProps.mock.lastCall?.[0]).toMatchObject({
      selected: null, touring: false,
      focusPoint: { x: 0, z: -9, distance: 200, height: 3 },
    });
  });
});
