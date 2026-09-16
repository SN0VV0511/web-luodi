import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityPanels } from "@/components/community-panels";
import { GUESTBOOK_DRAFT_KEY } from "@/lib/community-content";

beforeEach(() => {
  // Node 的实验性 localStorage 会遮蔽 JSDOM 实现；每项测试使用隔离存储。
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function writeDraft(name: string, message: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "怎么称呼你" }), {
    target: { value: name },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "写下一句问候或一个想法" }),
    { target: { value: message } },
  );
}

describe("城市留言草稿", () => {
  it("保存私人草稿，预览不执行 HTML，重新挂载后恢复内容", () => {
    const { unmount } = render(<CommunityPanels locale="zh" />);
    writeDraft("  访客  ", "  <img src=x onerror=alert(1)> 欢迎来到小城  ");
    expect(
      screen.getByLabelText("你的便签预览").querySelector("img"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "草稿已保存在此浏览器",
    );
    expect(
      JSON.parse(window.localStorage.getItem(GUESTBOOK_DRAFT_KEY) ?? "null"),
    ).toEqual({
      name: "访客",
      message: "<img src=x onerror=alert(1)> 欢迎来到小城",
    });
    unmount();
    render(<CommunityPanels locale="zh" />);
    expect(screen.getByRole("textbox", { name: "怎么称呼你" })).toHaveValue(
      "访客",
    );
    expect(
      screen.getByRole("textbox", { name: "写下一句问候或一个想法" }),
    ).toHaveValue("<img src=x onerror=alert(1)> 欢迎来到小城");
    expect(screen.getByRole("status")).toHaveTextContent(
      "已恢复此浏览器中保存的草稿",
    );
    expect(screen.getByText("本地草稿 · 未公开")).toBeInTheDocument();
  });

  it("拒绝空白必填内容和超长输入，并保留原草稿", () => {
    const original = JSON.stringify({
      name: "之前的访客",
      message: "已经保存",
    });
    window.localStorage.setItem(GUESTBOOK_DRAFT_KEY, original);
    render(<CommunityPanels locale="zh" />);
    writeDraft("  ", "一条留言");
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByRole("status")).toHaveTextContent("请填写昵称和留言");
    expect(screen.getByRole("textbox", { name: "怎么称呼你" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    writeDraft("访客", "");
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(
      screen.getByRole("textbox", { name: "写下一句问候或一个想法" }),
    ).toHaveAttribute("aria-invalid", "true");
    writeDraft("访客", "字".repeat(281));
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByRole("status")).toHaveTextContent("留言最多 280 字");
    expect(window.localStorage.getItem(GUESTBOOK_DRAFT_KEY)).toBe(original);
  });

  it.each([
    "not json",
    "null",
    '{"name":123,"message":"hello"}',
    '{"name":"ok","message":{}}',
    JSON.stringify({ name: "长".repeat(41), message: "hello" }),
  ])("损坏的存储不导致崩溃或覆盖原数据：%s", (raw) => {
    window.localStorage.setItem(GUESTBOOK_DRAFT_KEY, raw);
    render(<CommunityPanels locale="zh" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "已有草稿格式无法读取，原记录未修改",
    );
    expect(screen.getByRole("textbox", { name: "怎么称呼你" })).toHaveValue("");
    expect(window.localStorage.getItem(GUESTBOOK_DRAFT_KEY)).toBe(raw);
  });

  it("存储配额耗尽时明确提示未保存，并保留输入和已保存记录", () => {
    const original = JSON.stringify({
      name: "之前的访客",
      message: "已经保存",
    });
    window.localStorage.setItem(GUESTBOOK_DRAFT_KEY, original);
    render(<CommunityPanels locale="zh" />);
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    writeDraft("新的访客", "这段话必须留在输入框里");
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(screen.getByRole("status")).toHaveTextContent("草稿未能保存");
    expect(
      screen.getByRole("textbox", { name: "写下一句问候或一个想法" }),
    ).toHaveValue("这段话必须留在输入框里");
    expect(window.localStorage.getItem(GUESTBOOK_DRAFT_KEY)).toBe(original);
  });

  it("无法读取浏览器存储时仍允许编辑，切换语言保留草稿", () => {
    vi.mocked(window.localStorage.getItem).mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const { rerender } = render(<CommunityPanels locale="zh" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "浏览器暂时无法读取草稿",
    );
    writeDraft("访客", "继续写下想法");
    rerender(<CommunityPanels locale="en" />);
    expect(
      screen.getByRole("textbox", { name: "What should we call you?" }),
    ).toHaveValue("访客");
    expect(
      screen.getByRole("textbox", {
        name: "A greeting, a thought, a little note",
      }),
    ).toHaveValue("继续写下想法");
    expect(
      screen.getByText("CURATED READING · NOT A LIVE FEED"),
    ).toBeInTheDocument();
  });
});
