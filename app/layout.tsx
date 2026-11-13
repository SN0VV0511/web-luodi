import type { Metadata } from "next";
import type { ReactNode } from "react";

// Global CSS, in cascade order (later files override same-specificity rules in earlier ones).
// tokens → base → HUD → panels → tower rig → map/dock → community → responsive → info card → news → phone HUD → landmarks.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/hud.css";
import "./styles/panels.css";
import "./styles/tower-rig.css";
import "./styles/map-dock.css";
import "./styles/community.css";
import "./styles/responsive.css";
import "./styles/city-information.css";
import "./styles/news.css";
import "./styles/hud-mobile.css";
import "./landmarks.css";

export const metadata: Metadata = {
  title: "SN0VV CITY — 把想法，建成一座城",
  description:
    "探索 SN0VV 的沿海城市，在三个生活街区、中央公园、沙滩与货运港之间漫游，走进量化事务所、智能体总部和自托管应用空间。",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

/**
 * 提供站点级 HTML 骨架与全局元数据。
 *
 * @param props - 页面子节点。
 * @returns Next.js 根布局。
 */
export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
