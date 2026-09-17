"use client";

import { ArrowUpRight, Github, Mail, X } from "lucide-react";
import { CommunityPanels } from "@/components/community-panels";
import {
  aboutParagraphs,
  focusItems,
  profileItems,
  type Locale,
} from "@/lib/site-content";

const places = {
  about: {
    number: "01",
    address: "THE BUILDER · WATERFRONT",
    title: { zh: "关于 SN0VV", en: "About SN0VV" },
  },
  news: {
    number: "02",
    address: "SEASIDE PRESS · EST. 2026",
    title: { zh: "城市日报", en: "The City Journal" },
  },
  guestbook: {
    number: "03",
    address: "LETTERS TO SN0VV · COAST ROAD",
    title: { zh: "海岸信箱", en: "The Coastal Mailbox" },
  },
} as const;

/** 镜头抵达地标后展开的非模态信息卡，保留城市与访客草稿的交互。 */
export function CityInformation({
  place,
  locale,
  onClose,
}: Readonly<{
  place: "about" | "news" | "guestbook";
  locale: Locale;
  onClose: () => void;
}>) {
  const info = places[place];

  return (
    <section
      className={`city-information panel-${place}`}
      role="dialog"
      aria-modal={false}
      aria-label={info.title[locale]}
      tabIndex={-1}
    >
      <header className="city-information-heading">
        <p><span>{info.number}</span>{info.address}</p>
        <h2>{info.title[locale]}</h2>
        <button
          type="button"
          className="city-information-close"
          onClick={onClose}
          aria-label={locale === "zh" ? "关闭面板" : "Close panel"}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className="city-information-body">
        {place === "about" ? (
          <div className="city-builder">
            <p className="city-builder-intro">
              {locale === "zh" ? "把想法，建成真实的世界。" : "Building a world out of ideas."}
            </p>
            <p className="city-builder-description">{aboutParagraphs[locale][0]}</p>
            <div className="city-builder-profile">
              {profileItems.map((item) => (
                <div key={item.title.en}>
                  <h3>{item.title[locale]}</h3>
                  <p>{item.description[locale]}</p>
                </div>
              ))}
            </div>
            <div className="city-builder-interests" aria-label={locale === "zh" ? "关注方向" : "Interests"}>
              {focusItems.map((item) => <span key={item.title.en}>{item.title[locale]}</span>)}
            </div>
            <a
              className="city-builder-link"
              href="https://github.com/SN0VV0511"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={16} aria-hidden="true" />
              <span>{locale === "zh" ? "在 GitHub 继续探索" : "Explore on GitHub"}<small>@SN0VV0511</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a className="city-builder-link" href="mailto:dsxue51@gmail.com">
              <Mail size={16} aria-hidden="true" />
              <span>{locale === "zh" ? "写邮件给城主" : "Email the builder"}<small>dsxue51@gmail.com</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        ) : <CommunityPanels locale={locale} />}
      </div>
    </section>
  );
}
