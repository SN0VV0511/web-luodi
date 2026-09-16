import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

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
