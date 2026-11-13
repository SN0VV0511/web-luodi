import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, Building2, Cpu } from "lucide-react";

import "./styles/not-found.css";

export const metadata: Metadata = {
  title: "404 · 这条街还在规划中 — SN0VV CITY",
  description: "页面不存在。回到 SN0VV CITY 继续漫游。",
};

/**
 * 站点 404：与城市 HUD 同一套导航蓝 + 金色，纯静态，无三维场景。
 *
 * @returns 未找到页面。
 */
export default function NotFound(): ReactNode {
  return (
    <main className="not-found" aria-labelledby="not-found-title">
      <div className="not-found-card">
        <a className="not-found-brand" href="/" aria-label="SN0VV CITY 首页">
          <span className="not-found-brand-icon" aria-hidden="true">
            <Building2 size={22} strokeWidth={1.5} />
          </span>
          <span>
            SN0VV<b>CITY</b>
          </span>
        </a>
        <p className="not-found-code">
          <span>404</span> / 未找到 · Not found
        </p>
        <h1 id="not-found-title">这条街还在规划中。</h1>
        <p className="not-found-copy">
          你要找的页面不存在，或者已经搬去了别的街区。回到城市总览继续逛，或者直接去下面几处。
          <span lang="en">This street hasn&apos;t been built yet. Head back to the city or jump to one of these.</span>
        </p>
        <nav className="not-found-actions" aria-label="常用入口">
          <a className="not-found-primary" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            回到城市
          </a>
          <a href="/biglink/">
            <Cpu size={17} aria-hidden="true" />
            Biglink 手册
          </a>
          <a href="/lora/">
            <BookOpen size={17} aria-hidden="true" />
            LoRA 详解
          </a>
        </nav>
        <svg className="not-found-skyline" viewBox="0 0 480 72" aria-hidden="true" focusable="false">
          <path d="M0 72V52h28V34h22v18h16V20h30v32h18V40h24v-8h20v20h14V28h26v24h22V12h34v40h18V36h22v16h16V24h28v28h22V44h24V36h30V22h28V48h38V72z" />
          <rect className="not-found-crane" x="300" y="6" width="3" height="40" />
          <rect className="not-found-crane" x="270" y="6" width="70" height="3" />
        </svg>
      </div>
    </main>
  );
}
