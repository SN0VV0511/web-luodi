import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "SN0VV - Explore and Build",
  description: "SN0VV 的个人智能体、实验项目与联系入口。",
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
