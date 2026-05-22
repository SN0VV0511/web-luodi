import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { LandingPage } from "@/components/landing-page";

vi.mock("next/image", () => ({
  default: ({ alt, src, ...props }: ComponentProps<"img">) => (
    // Next Image 在测试环境不负责优化，保留语义即可验证页面交互。
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === "string" ? src : ""} {...props} />
  ),
}));

describe("LandingPage", () => {
  it("通过 Hero 热区翻到关于页并返回", () => {
    const { container } = render(<LandingPage />);
    const hero = container.querySelector(".hero-band");

    expect(hero).not.toHaveClass("is-about-open");

    fireEvent.pointerDown(screen.getByRole("button", { name: "关于我" }));
    expect(hero).toHaveClass("is-about-open");

    fireEvent.pointerDown(screen.getByRole("button", { name: "返回" }));
    expect(hero).not.toHaveClass("is-about-open");
  });

  it("鼠标只在真正离开 Hero 时收起反色圆", () => {
    const { container } = render(<LandingPage />);
    const hero = container.querySelector<HTMLElement>(".hero-band");
    const patternToken = container.querySelector<HTMLElement>(".pattern-row span");

    expect(hero).not.toBeNull();
    expect(patternToken).not.toBeNull();

    vi.spyOn(hero as HTMLElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 600, 600),
    );

    fireEvent.mouseMove(hero as HTMLElement, { clientX: 220, clientY: 260 });
    expect(hero).toHaveStyle({ "--spot-radius": "168px" });

    fireEvent.mouseOut(hero as HTMLElement, { relatedTarget: patternToken });
    expect(hero).toHaveStyle({ "--spot-radius": "168px" });

    fireEvent.mouseOut(hero as HTMLElement, { relatedTarget: document.body });
    expect(hero).toHaveStyle({ "--spot-radius": "0px" });
  });

  it("页面级鼠标移动会同步 Hero 反色圆", () => {
    const { container } = render(<LandingPage />);
    const hero = container.querySelector<HTMLElement>(".hero-band");

    expect(hero).not.toBeNull();

    vi.spyOn(hero as HTMLElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(40, 56, 600, 600),
    );

    fireEvent.mouseMove(document, { clientX: 260, clientY: 280 });
    expect(hero).toHaveStyle({
      "--spot-x": "220px",
      "--spot-y": "224px",
      "--spot-radius": "168px",
    });

    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    expect(hero).toHaveStyle({ "--spot-radius": "0px" });
  });

  it("使用个人主页信息区替代产品站模块", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "个人档案" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关注方向" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "联系" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "快速体验" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Blog" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "加入我们" })).not.toBeInTheDocument();
  });
});
