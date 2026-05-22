"use client";

import Image, { type StaticImageData } from "next/image";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Languages,
} from "lucide-react";

import affineImage from "@/assets/affine.png";
import agentBaseImage from "@/assets/agent_base.png";
import openclawImage from "@/assets/openclaw.png";
import {
  aboutParagraphs,
  focusItems,
  formatListIndex,
  heroCopy,
  localeLabels,
  pickLocale,
  profileItems,
  showcaseItems,
  type InfoItem,
  type Locale,
  type LocalizedText,
  type ShowcaseItem,
} from "@/lib/site-content";

type HeaderProps = Readonly<{
  locale: Locale;
  menuId: string;
  languageMenuOpen: boolean;
  onLanguageMenuToggle: () => void;
  onLocaleChange: (locale: Locale) => void;
}>;

type InfoRowsProps = Readonly<{
  items: readonly InfoItem[];
  locale: Locale;
}>;

const showcaseImages: Readonly<Record<ShowcaseItem["image"], StaticImageData>> =
  {
    openclaw: openclawImage,
    affine: affineImage,
    agentBase: agentBaseImage,
  };

const patternRows: readonly number[] = Array.from({ length: 12 }, (_, index) => index);
const patternTexts: readonly string[] = Array.from({ length: 20 }, () => "S N 0 V V");
const heroSpotlightRadius = "168px";

/**
 * 渲染 SN0VV 的 MiMo 风格个人落地页。
 *
 * @returns 可交互的首页。
 */
export function LandingPage(): ReactNode {
  const [locale, setLocale] = useState<Locale>("zh");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const languageMenuId = useId();
  const languageSwitchRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(() => {
    const closeLanguageMenu = (event: globalThis.PointerEvent): void => {
      if (!languageSwitchRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
        setAboutOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeLanguageMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeLanguageMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const syncSpotlightWithHero = (
      clientX: number,
      clientY: number,
    ): void => {
      const hero = heroRef.current;

      if (!hero) {
        return;
      }

      const bounds = hero.getBoundingClientRect();
      if (isOutsideHero(bounds, clientX, clientY)) {
        clearHeroSpotlight(hero);
        return;
      }

      placeHeroSpotlight(hero, bounds, clientX, clientY);
    };

    const syncSpotlightFromPointer = (
      event: globalThis.PointerEvent,
    ): void => {
      syncSpotlightWithHero(event.clientX, event.clientY);
    };

    const syncSpotlightFromMouse = (event: globalThis.MouseEvent): void => {
      syncSpotlightWithHero(event.clientX, event.clientY);
    };

    document.addEventListener("pointermove", syncSpotlightFromPointer);
    document.addEventListener("mousemove", syncSpotlightFromMouse);

    return () => {
      document.removeEventListener("pointermove", syncSpotlightFromPointer);
      document.removeEventListener("mousemove", syncSpotlightFromMouse);
    };
  }, []);

  const onHeroPointerMove = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect();

    if (isOutsideHero(bounds, event.clientX, event.clientY)) {
      onHeroPointerLeave(event);
      return;
    }

    placeHeroSpotlight(event.currentTarget, bounds, event.clientX, event.clientY);
  };

  const onHeroMouseMove = (event: ReactMouseEvent<HTMLElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();

    if (isOutsideHero(bounds, event.clientX, event.clientY)) {
      onHeroMouseLeave(event);
      return;
    }

    placeHeroSpotlight(event.currentTarget, bounds, event.clientX, event.clientY);
  };

  const onHeroPointerLeave = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    clearHeroSpotlight(event.currentTarget);
  };

  const onHeroPointerCaptureMove = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect();

    if (isOutsideHero(bounds, event.clientX, event.clientY)) {
      onHeroPointerLeave(event);
      return;
    }

    placeHeroSpotlight(event.currentTarget, bounds, event.clientX, event.clientY);
  };

  const onHeroPointerOut = (event: ReactPointerEvent<HTMLElement>): void => {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      onHeroPointerLeave(event);
    }
  };

  const onAboutZonePointerEnter = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const hero = event.currentTarget.closest<HTMLElement>(".hero-band");

    hero?.style.setProperty("--peel-angle", "-2.5deg");
  };

  const onAboutZonePointerLeave = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const hero = event.currentTarget.closest<HTMLElement>(".hero-band");

    hero?.style.setProperty("--peel-angle", "0deg");
    hero?.style.setProperty("--peel-rise", "0px");
  };

  const onAboutZonePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const hero = event.currentTarget.closest<HTMLElement>(".hero-band");

    hero?.style.setProperty("--peel-angle", "-2.5deg");
  };

  const onHeroMouseLeave = (event: ReactMouseEvent<HTMLElement>): void => {
    clearHeroSpotlight(event.currentTarget);
  };

  const onHeroMouseOut = (event: ReactMouseEvent<HTMLElement>): void => {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      onHeroMouseLeave(event);
    }
  };

  const onAboutZoneMouseEnter = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const hero = event.currentTarget.closest<HTMLElement>(".hero-band");

    hero?.style.setProperty("--peel-angle", "-2.5deg");
  };

  const onAboutZoneMouseLeave = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const hero = event.currentTarget.closest<HTMLElement>(".hero-band");

    hero?.style.setProperty("--peel-angle", "0deg");
    hero?.style.setProperty("--peel-rise", "0px");
  };

  const onShowcasePointerEnter = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    event.currentTarget.classList.add("is-hovered");
  };

  const onShowcasePointerLeave = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    event.currentTarget.classList.remove("is-hovered");
  };

  const onShowcaseMouseEnter = (
    event: ReactMouseEvent<HTMLElement>,
  ): void => {
    event.currentTarget.classList.add("is-hovered");
  };

  const onShowcaseMouseLeave = (
    event: ReactMouseEvent<HTMLElement>,
  ): void => {
    event.currentTarget.classList.remove("is-hovered");
  };

  const onShowcasePointerMove = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    event.currentTarget.classList.add("is-hovered");
  };

  return (
    <div className="landing-shell">
      <SiteHeader
        languageMenuOpen={languageMenuOpen}
        locale={locale}
        menuId={languageMenuId}
        onLanguageMenuToggle={() => {
          setLanguageMenuOpen((open) => !open);
        }}
        onLocaleChange={(nextLocale) => {
          setLocale(nextLocale);
          setLanguageMenuOpen(false);
        }}
      />

      <main>
        <section
          aria-label={pickLocale(heroCopy.aboutAction, locale)}
          className={`hero-band${aboutOpen ? " is-about-open" : ""}`}
          onMouseDown={onHeroMouseMove}
          onMouseEnter={onHeroMouseMove}
          onMouseLeave={onHeroMouseLeave}
          onMouseMoveCapture={onHeroMouseMove}
          onMouseMove={onHeroMouseMove}
          onMouseOut={onHeroMouseOut}
          onPointerDown={onHeroPointerMove}
          onPointerEnter={onHeroPointerMove}
          onPointerLeave={onHeroPointerLeave}
          onPointerMoveCapture={onHeroPointerCaptureMove}
          onPointerMove={onHeroPointerMove}
          onPointerOut={onHeroPointerOut}
          ref={heroRef}
        >
          <div className="hero-flip">
            <div className="hero-flip-inner">
              <div className="hero-face hero-front">
                <div className="hero-card">
                  <PatternField inverted={false} />

                  <div className="hero-message" aria-hidden={aboutOpen}>
                    <h1>{pickLocale(heroCopy.title, locale)}</h1>
                  </div>

                  <div aria-hidden="true" className="hero-invert">
                    <PatternField inverted />
                    <div className="hero-message inverse">
                      <h1>{pickLocale(heroCopy.title, locale === "zh" ? "en" : "zh")}</h1>
                    </div>
                    <span className="hero-about-reveal">
                      {pickLocale(heroCopy.aboutAction, locale)}
                    </span>
                  </div>
                </div>

                <button
                  aria-expanded={aboutOpen}
                  aria-label={pickLocale(heroCopy.aboutAction, locale)}
                  className="hero-about-zone"
                  onClick={() => {
                    setAboutOpen(true);
                  }}
                  onPointerDown={() => {
                    setAboutOpen(true);
                  }}
                  onPointerEnter={onAboutZonePointerEnter}
                  onPointerLeave={onAboutZonePointerLeave}
                  onPointerMove={onAboutZonePointerMove}
                  onMouseEnter={onAboutZoneMouseEnter}
                  onMouseLeave={onAboutZoneMouseLeave}
                  type="button"
                >
                  <span>{pickLocale(heroCopy.aboutAction, locale)}</span>
                </button>
              </div>

              <article aria-hidden={!aboutOpen} className="hero-face hero-back">
                <div className="hero-back-card">
                  <button
                    aria-label={pickLocale(heroCopy.closeAction, locale)}
                    className="hero-back-zone"
                    onClick={() => {
                      setAboutOpen(false);
                    }}
                    onPointerDown={() => {
                      setAboutOpen(false);
                    }}
                    onMouseEnter={onAboutZoneMouseEnter}
                    onMouseLeave={onAboutZoneMouseLeave}
                    onPointerEnter={onAboutZonePointerEnter}
                    onPointerLeave={onAboutZonePointerLeave}
                    onPointerMove={onAboutZonePointerMove}
                    type="button"
                  >
                    <span>{pickLocale(heroCopy.closeAction, locale)}</span>
                  </button>
                  <div className="hero-back-content">
                    <div className="about-card">
                      {aboutParagraphs[locale].map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      <p>
                        <strong>SN0VV</strong>
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section aria-label="SN0VV projects" className="showcase-grid" id="projects">
          {showcaseItems.map((item) => (
            <article
              className={`showcase-card ${item.tone}`}
              key={item.title}
              onMouseEnter={onShowcaseMouseEnter}
              onMouseLeave={onShowcaseMouseLeave}
              onPointerEnter={onShowcasePointerEnter}
              onPointerLeave={onShowcasePointerLeave}
              onPointerMove={onShowcasePointerMove}
            >
              <div className="showcase-copy">
                <h2>{item.title}</h2>
                <p>{pickLocale(item.description, locale)}</p>
              </div>
              <Image
                alt={item.title}
                className="showcase-image"
                placeholder="blur"
                sizes="(max-width: 760px) 100vw, 33vw"
                src={showcaseImages[item.image]}
              />
            </article>
          ))}
        </section>

        <section aria-labelledby="profile-title" className="content-section" id="profile">
          <header className="section-heading">
            <h2 id="profile-title">{localized(locale, "个人档案", "Profile")}</h2>
            <p>
              {localized(
                locale,
                "用工程和交互把智能实验做成能被使用、验证和迭代的东西。",
                "Build intelligent experiments that can be used, verified, and iterated through engineering and interaction.",
              )}
            </p>
          </header>
          <InfoRows items={profileItems} locale={locale} />
        </section>

        <section aria-labelledby="focus-title" className="content-section" id="focus">
          <header className="section-heading">
            <h2 id="focus-title">{localized(locale, "关注方向", "Focus")}</h2>
            <p>
              {localized(
                locale,
                "主页会持续收录我正在试的项目、工具链和个人工作流。",
                "This page keeps track of the projects, toolchains, and personal workflows I am exploring.",
              )}
            </p>
          </header>
          <InfoRows items={focusItems} locale={locale} />
        </section>

        <section
          aria-labelledby="contact-title"
          className="content-section contact-section"
          id="contact"
        >
          <header className="section-heading contact-heading">
            <h2 id="contact-title">{localized(locale, "联系", "Contact")}</h2>
            <p>
              {localized(
                locale,
                "项目讨论、工程协作或单纯打个招呼，都可以直接发邮件。",
                "For project discussions, engineering collaboration, or a quick hello, email me directly.",
              )}
            </p>
          </header>
          <a className="contact-line" href="mailto:sn0vv@yourdomain.com">
            <span>{localized(locale, "邮箱联系", "Email")}</span>
            <strong>sn0vv@yourdomain.com</strong>
            <ArrowUpRight aria-hidden="true" size={18} />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        Copyright © 2026 SN0VV. All Rights Reserved.
      </footer>
    </div>
  );

  function SiteHeader({
    locale: currentLocale,
    menuId,
    languageMenuOpen: menuOpen,
    onLanguageMenuToggle,
    onLocaleChange,
  }: HeaderProps): ReactNode {
    return (
      <header className="site-header">
        <a aria-label="SN0VV home" className="brand-mark" href="#">
          <span className="brand-word">SN</span>
          <span aria-hidden="true" className="brand-zero" />
          <span aria-hidden="true" className="brand-tail">
            VV
          </span>
        </a>

        <nav aria-label="Primary" className="site-nav">
          <a href="#profile">{localized(currentLocale, "档案", "Profile")}</a>
          <a href="#contact">{localized(currentLocale, "联系", "Contact")}</a>

          <div className="language-switch" ref={languageSwitchRef}>
            <button
              aria-controls={menuId}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="language-button"
              onClick={onLanguageMenuToggle}
              type="button"
            >
              <Languages aria-hidden="true" size={18} />
              <span>{localeLabels[currentLocale]}</span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            <div
              aria-hidden={!menuOpen}
              className="language-menu"
              id={menuId}
              role="menu"
            >
              {(Object.keys(localeLabels) as Locale[]).map((option) => (
                <button
                  className={option === currentLocale ? "is-active" : undefined}
                  key={option}
                  onClick={() => {
                    onLocaleChange(option);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {localeLabels[option]}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>
    );
  }
}

function PatternField({ inverted }: Readonly<{ inverted: boolean }>): ReactNode {
  return (
    <div className={`pattern-field${inverted ? " inverse" : ""}`}>
      {patternRows.map((row) => (
        <div className="pattern-row" key={row}>
          {patternTexts.map((token, index) => (
            <span key={`${token}-${row}-${index}`}>{token}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function InfoRows({ items, locale }: InfoRowsProps): ReactNode {
  return (
    <div className="info-rows">
      {items.map((item, index) => (
        <article
          className="info-row"
          key={`${pickLocale(item.title, locale)}-${index}`}
        >
          <span className="row-index">{formatListIndex(index)}</span>
          <span className="row-copy">
            <strong>{pickLocale(item.title, locale)}</strong>
            <small>{pickLocale(item.description, locale)}</small>
          </span>
          <strong className="row-detail">{pickLocale(item.detail, locale)}</strong>
        </article>
      ))}
    </div>
  );
}

function localized(locale: Locale, zh: string, en: string): string {
  const copy: LocalizedText = { zh, en };

  return pickLocale(copy, locale);
}

function isOutsideHero(bounds: DOMRect, clientX: number, clientY: number): boolean {
  return (
    clientX <= bounds.left ||
    clientX >= bounds.right ||
    clientY <= bounds.top ||
    clientY >= bounds.bottom
  );
}

function placeHeroSpotlight(
  hero: HTMLElement,
  bounds: DOMRect,
  clientX: number,
  clientY: number,
): void {
  hero.style.setProperty("--spot-x", `${clientX - bounds.left}px`);
  hero.style.setProperty("--spot-y", `${clientY - bounds.top}px`);
  hero.style.setProperty("--spot-radius", heroSpotlightRadius);
}

function clearHeroSpotlight(hero: HTMLElement): void {
  hero.style.setProperty("--spot-radius", "0px");
  hero.style.setProperty("--peel-angle", "0deg");
  hero.style.setProperty("--peel-rise", "0px");
}
