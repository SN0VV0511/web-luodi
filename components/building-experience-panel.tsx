"use client";

import { ArrowUpRight, ArrowLeft, Github, MoveUpRight, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { safeAppUrl, type CityPlace } from "@/lib/city-content";
import { clampChapter, type BuildingExperience } from "@/lib/building-experience";
import { pickLocale, type Locale } from "@/lib/site-content";

type BuildingExperiencePanelProps = {
  place: CityPlace;
  experience: BuildingExperience;
  locale: Locale;
  chapter: number;
  approaching: boolean;
  onChapterChange: (chapter: number) => void;
  onReplay: () => void;
  onClose: () => void;
};

/** 非模态建筑导览：章节控制真实 3D 机构，应用跳转始终由用户显式确认。 */
export function BuildingExperiencePanel({ place, experience, locale, chapter, approaching, onChapterChange, onReplay, onClose }: BuildingExperiencePanelProps): ReactNode {
  const current = clampChapter(chapter);
  const href = safeAppUrl(place.href);
  const source = safeAppUrl(place.sourceHref);
  const t = (zh: string, en: string): string => locale === "zh" ? zh : en;
  return (
    <>
      <div className="landmark-viewfinder" aria-hidden="true">
        <span className="landmark-viewfinder-number">{place.number}</span>
        <span className="landmark-viewfinder-line" />
        <span>{pickLocale(experience.material, locale)}</span>
      </div>
      <div className="landmark-console" data-kind={experience.kind}>
        <header className="landmark-console-header">
          <span className="landmark-address">SN / {place.number}</span>
          <span>{t("建筑漫游", "BUILDING WALKTHROUGH")}</span>
          <button type="button" onClick={onClose} aria-label={t("关闭建筑详情", "Close building details")}>
            <X size={18} />
          </button>
        </header>
        <div className="landmark-intro">
          <p className="landmark-eyebrow">{experience.subtitle}</p>
          <h2>{place.name}</h2>
          <p className="landmark-tagline">{pickLocale(experience.title, locale)}</p>
        </div>
        <div className="landmark-chapters" role="group" aria-label={t("建筑机构与视角", "Building mechanisms and viewpoints")}>
          {experience.chapters.map((item, index) => (
            <button key={index} type="button" aria-pressed={current === index} aria-controls={`landmark-story-${place.id}`} onClick={() => onChapterChange(index)}>
              <span className="landmark-chapter-number">0{index + 1}</span>
              <span>{pickLocale(item.label, locale)}</span>
              <MoveUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="landmark-story" id={`landmark-story-${place.id}`}>
          <p>{pickLocale(experience.chapters[current].description, locale)}</p>
        </div>
        <div className="landmark-playback">
          <span className={approaching ? "is-approaching" : ""} role="status" aria-live="polite">
            <i aria-hidden="true" />
            {approaching ? t("镜头行进中 · 可随时操作", "MOVING · CONTROLS STAY ACTIVE") : t("自由观察 · 拖动旋转 / 滚轮缩放", "EXPLORE · DRAG TO ORBIT / SCROLL")}
          </span>
          <button type="button" onClick={onReplay} aria-label={t("重新演示建筑机构", "Replay building mechanism")} title={t("重新演示", "Replay")}>
            <RotateCcw size={15} />
          </button>
        </div>
        <footer className="landmark-console-footer">
          {href && !place.vacant ? (
            <a className="landmark-enter" href={href} target="_blank" rel="noopener noreferrer">
              <span>{pickLocale(experience.action, locale)}</span><ArrowUpRight size={18} />
            </a>
          ) : (
            <p className="landmark-connection-note">
              {place.vacant ? t("这栋楼，留给下一个新想法。", "A home for your next idea.") : t("应用访问地址待配置", "Application link not configured")}
            </p>
          )}
          <div className="landmark-footer-links">
            <button type="button" onClick={onClose}><ArrowLeft size={14} />{t("返回城市", "Back to city")}</button>
            {source && <a href={source} target="_blank" rel="noopener noreferrer"><Github size={14} />{t("查看源码", "View source")}</a>}
            {!source && <span>{place.vacant ? t("空间待入驻", "AVAILABLE SPACE") : t("空间演示 / 非服务实况", "SPATIAL DEMO / NOT LIVE")}</span>}
          </div>
        </footer>
      </div>
    </>
  );
}
