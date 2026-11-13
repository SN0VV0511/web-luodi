"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Droplets,
  Flame,
  Heart,
  MessageCircle,
  Radio,
  ShieldAlert,
  Ship,
  SlidersHorizontal,
  Siren,
  Sparkles,
  Users,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import {
  getCityTimeline,
  getCityChirps,
  getCityTelemetry,
  type ActiveCityIncident,
  type IncidentKind,
} from "@/lib/city-events";
import type { Locale } from "@/lib/site-content";
import { sampleSeasonState, type SeasonMode } from "@/lib/city-seasons";
import { sampleCityClock } from "@/lib/city-physics";
import { liveCityIncidents, type CityLifeSnapshot } from "@/lib/real-city/snapshot";
import { useMounted } from "@/lib/use-mounted";

type HudTab = "incidents" | "infra" | "chirper";
type PolicyId = "smokeDetector" | "greenGrid" | "cruiseDutyFree" | "zeroDischarge";

type FocusTarget = {
  x: number;
  z: number;
  distance?: number;
  height?: number;
};

type CitySkylinesHudProps = {
  cityLife?: CityLifeSnapshot | null;
  worldSeconds: number;
  night?: boolean;
  locale: Locale;
  seasonMode: SeasonMode;
  onSeasonModeChange: (season: SeasonMode) => void;
  onFocusPoint: (target: FocusTarget) => void;
};

function incidentIcon(kind: IncidentKind): ReactNode {
  switch (kind) {
    case "fire":
      return <Flame size={13} />;
    case "burglar":
      return <ShieldAlert size={13} />;
    case "cruise":
      return <Ship size={13} />;
    case "medical":
      return <Heart size={13} />;
    case "utility":
      return <Wrench size={13} />;
    case "traffic":
      return <Siren size={13} />;
    case "life":
      return <Users size={13} />;
  }
}

export function CitySkylinesHud({
  cityLife = null,
  worldSeconds,
  night = false,
  locale,
  seasonMode,
  onSeasonModeChange,
  onFocusPoint,
}: CitySkylinesHudProps): ReactNode {
  const [tab, setTab] = useState<HudTab>("incidents");
  const [collapsed, setCollapsed] = useState(true);
  const expandedPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!collapsed) expandedPanelRef.current?.focus({ preventScroll: true });
  }, [collapsed]);
  const foldButtonRef = useRef<HTMLButtonElement>(null);
  const [policyDrawerOpen, setPolicyDrawerOpen] = useState(false);
  const [policies, setPolicies] = useState<Record<PolicyId, boolean>>({
    smokeDetector: true,
    greenGrid: true,
    cruiseDutyFree: true,
    zeroDischarge: true,
  });

  const zh = locale === "zh";
  const t = (cn: string, en: string): string => (zh ? cn : en);

  const eventsReady = useMounted();
  const telemetry = getCityTelemetry(worldSeconds, night);
  const incidents = eventsReady
    ? [...liveCityIncidents(cityLife, locale), ...getCityTimeline(worldSeconds, locale)]
    : [];
  const chirps = eventsReady ? getCityChirps(worldSeconds, locale) : [];
  const season = sampleSeasonState(worldSeconds, seasonMode);
  const hour = sampleCityClock(worldSeconds).hour;
  const cityTime = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor(hour % 1 * 60)).padStart(2, "0")}`;
  const seasonLabels = {
    auto: t("自动更替", "Cycle seasons"), spring: t("春", "Spring"),
    summer: t("夏", "Summer"), autumn: t("秋", "Autumn"), winter: t("冬", "Winter"),
  };

  const effectivePowerOutput =
    telemetry.powerOutputMw + (policies.greenGrid ? 48 : 0);
  const effectivePurity = Math.min(
    99.9,
    +(telemetry.sewagePurityPct + (policies.zeroDischarge ? 0.3 : 0)).toFixed(1),
  );
  const effectiveHappiness = Math.min(
    99,
    telemetry.happiness +
      (policies.smokeDetector ? 1 : 0) +
      (policies.cruiseDutyFree ? 1 : 0),
  );
  const effectiveFireSafety = Math.min(
    99,
    telemetry.fireSafetyPct + (policies.smokeDetector ? 3 : 0),
  );

  const togglePolicy = (id: PolicyId): void => {
    setPolicies((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const focusIncident = (item: ActiveCityIncident): void => {
    onFocusPoint({
      x: item.x,
      z: item.z,
      distance: item.focusDistance,
      height: item.focusHeight,
    });
  };
  const collapse = (): void => {
    setCollapsed(true);
    requestAnimationFrame(() => foldButtonRef.current?.focus({ preventScroll: true }));
  };

  const infraLandmarks = [
    {
      id: "cruise-port",
      badge: "HARBOR",
      accent: "cyan",
      icon: <Ship size={14} />,
      title: t("海洋邮轮母港 · 豪华游轮", "Ocean Cruise Terminal & Liner"),
      desc: t(
        `8层甲板水上滑梯 · ${telemetry.cruiseStatusLabel.zh}`,
        `8-deck liner & slides · ${telemetry.cruiseStatusLabel.en}`,
      ),
      x: 48,
      z: 178,
      distance: 82,
      height: 11,
    },
    {
      id: "wastewater-plant",
      badge: "WATER",
      accent: "emerald",
      icon: <Droplets size={14} />,
      title: t("东湾生态污水处理厂", "Eco Wastewater Treatment Plant"),
      desc: t(
        `旋转刮泥桥 · 曝气池气泡 · 净水率 ${effectivePurity}%`,
        `Rotating clarifiers & aeration · ${effectivePurity}% pure`,
      ),
      x: 264,
      z: 54,
      distance: 74,
      height: 6,
    },
    {
      id: "power-station",
      badge: "POWER",
      accent: "amber",
      icon: <Zap size={14} />,
      title: t("北湾联合循环发电厂与风电阵", "Power Plant & Wind Turbine Grid"),
      desc: t(
        `双曲冷却塔蒸汽 · 220kV变电 · 输出 ${effectivePowerOutput}MW`,
        `Cooling towers, 220kV grid & wind · ${effectivePowerOutput}MW`,
      ),
      x: 268,
      z: -62,
      distance: 94,
      height: 16,
    },
    {
      id: "modern-condos",
      badge: "CONDO",
      accent: "blue",
      icon: <Building2 size={14} />,
      title: t("现代高层商品房住宅小区", "Modern High-Rise Condo District"),
      desc: t(
        "悬挑玻璃阳台 · 空调外机 · 地库道闸 · 快递柜",
        "Glass balconies, AC units, garage ramp & lockers",
      ),
      x: -142.5,
      z: -2.5,
      distance: 54,
      height: 13,
    },
    {
      id: "coastal-villas",
      badge: "VILLA",
      accent: "gold",
      icon: <Sparkles size={14} />,
      title: t("西海岸奢华泳池别墅区", "West Coast Luxury Pool Villas"),
      desc: t(
        "发光马赛克泳池 · 阳光木甲板 · 树篱私家车库",
        "Turquoise mosaic pools, sun decks & private SUVs",
      ),
      x: -241.5,
      z: -38,
      distance: 48,
      height: 5,
    },
    {
      id: "commercial-plaza",
      badge: "PLAZA",
      accent: "violet",
      icon: <Activity size={14} />,
      title: t("现代商业综合体与露天街铺", "Modern Commercial Retail Plaza"),
      desc: t(
        "发光灯箱店招 · 精品咖啡外摆 · 24H便利店",
        "Backlit retail signboards & outdoor café umbrellas",
      ),
      x: 97.5,
      z: 42.5,
      distance: 46,
      height: 6,
    },
  ] as const;

  const policyItems: {
    id: PolicyId;
    title: string;
    effect: string;
  }[] = [
    {
      id: "smokeDetector",
      title: t("全城普及智能烟雾报警器", "Citywide Smoke Detectors"),
      effect: t("消防安全 +3% · 幸福度 +1%", "Fire safety +3% · Happiness +1%"),
    },
    {
      id: "greenGrid",
      title: t("风光储清洁并网优先调度", "Renewable Grid Priority"),
      effect: t("绿电冗余 +48 MW", "Clean power +48 MW"),
    },
    {
      id: "cruiseDutyFree",
      title: t("国际邮轮母港免税旅游区", "Cruise Harbor Duty-Free"),
      effect: t("商业活力提升 · 幸福度 +1%", "Commercial boost · Happiness +1%"),
    },
    {
      id: "zeroDischarge",
      title: t("海湾三级膜处理零直排令", "Zero-Discharge Bay Mandate"),
      effect: t("出水净度升至 99.7%+", "Water purity up to 99.7%+"),
    },
  ];

  if (collapsed) return (
    <aside className="live-scenes-panel skylines-console is-collapsed" data-hud-zone="" aria-label={t("城市生活", "City life")}>
      <button
        ref={foldButtonRef}
        type="button"
        className="skylines-fold-toggle"
        aria-expanded={false}
        aria-label={t("展开城市生活与四季", "Open city life and seasons")}
        onClick={() => setCollapsed(false)}
      >
        <span className="live-pulse-dot" aria-hidden="true" />
        <span>{t("城市生活", "City life")}</span>
        <small title={t("模拟城市时间 / 正在发生的事件", "Simulated city time / active events")}>{seasonLabels[season.season]} · {cityTime}{eventsReady ? ` · ${incidents.length}` : ""}</small>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </aside>
  );

  return (
    <aside
      ref={expandedPanelRef}
      tabIndex={-1}
      className={`live-scenes-panel skylines-console${collapsed ? " is-collapsed" : ""}`}
      data-hud-zone=""
      aria-label={t("城市生活与四季", "City life and seasons")}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); collapse(); }
      }}
    >
      <div className="skylines-topbar">
        <div className="skylines-brand-row">
          <span className="live-pulse-dot" aria-hidden="true" />
          <strong>
            {t("城市生活与四季", "City life & seasons")}
          </strong>
          <div className="skylines-rci" title={t("RCI 住/商/办需求指数", "RCI Zoning Demand")}>
            <span className="rci-bar is-res">
              <i style={{ height: `${telemetry.rciDemand.residential}%` }} />
            </span>
            <span className="rci-bar is-com">
              <i style={{ height: `${telemetry.rciDemand.commercial}%` }} />
            </span>
            <span className="rci-bar is-off">
              <i style={{ height: `${telemetry.rciDemand.office}%` }} />
            </span>
          </div>
          <button
            type="button"
            className={`skylines-icon-btn${policyDrawerOpen ? " is-active" : ""}`}
            aria-expanded={policyDrawerOpen}
            aria-label={t("市政总览与法令", "City policies & telemetry")}
            onClick={() => {
              setCollapsed(false);
              setPolicyDrawerOpen((v) => !v);
            }}
          >
            <SlidersHorizontal size={12} />
          </button>
          <button
            type="button"
            className="skylines-icon-btn"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? t("展开城市生活", "Expand city life")
                : t("收起城市生活", "Collapse city life")
            }
            onClick={collapse}
          >
            <ChevronDown
              size={13}
              style={{
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}
            />
          </button>
        </div>

        <div className="skylines-metrics-strip">
          <button
            type="button"
            className="skylines-metric-pill"
            onClick={() =>
              onFocusPoint({ x: 268, z: -62, distance: 94, height: 16 })
            }
            title={t("点击查看发电厂与电网", "Inspect Power Plant")}
          >
            <Zap size={11} className="is-amber" />
            <span>{effectivePowerOutput}MW</span>
          </button>
          <button
            type="button"
            className="skylines-metric-pill"
            onClick={() =>
              onFocusPoint({ x: 264, z: 54, distance: 74, height: 6 })
            }
            title={t("点击查看污水处理厂", "Inspect Wastewater Plant")}
          >
            <Droplets size={11} className="is-cyan" />
            <span>{effectivePurity}%</span>
          </button>
          <button
            type="button"
            className="skylines-metric-pill"
            onClick={() =>
              onFocusPoint({ x: -142.5, z: -2.5, distance: 56, height: 13 })
            }
            title={t("点击查看现代居民区", "Inspect Residential District")}
          >
            <Users size={11} className="is-green" />
            <span>{telemetry.population.toLocaleString()}</span>
          </button>
          <span className="skylines-metric-pill is-static">
            <Sparkles size={11} className="is-gold" />
            <span>{effectiveHappiness}%</span>
          </span>
        </div>
      </div>

      {!collapsed && (
        <>
          <label className="skylines-season-control">
            <span>{t("四季", "Season")}</span>
            <select value={seasonMode} onChange={(event) => onSeasonModeChange(event.target.value as SeasonMode)}>
              {(Object.keys(seasonLabels) as SeasonMode[]).map((mode) => (
                <option key={mode} value={mode}>{seasonLabels[mode]}</option>
              ))}
            </select>
            <small>{season.temperatureC}°C</small>
          </label>
          {policyDrawerOpen && (
            <div className="skylines-policy-drawer">
              <div className="policy-telemetry-grid">
                <div>
                  <small>{t("电网负荷 / 绿电", "GRID LOAD / RENEW")}</small>
                  <strong>
                    {telemetry.powerLoadMw} /{" "}
                    {telemetry.windOutputMw + telemetry.solarOutputMw} MW
                  </strong>
                </div>
                <div>
                  <small>{t("日污水处理量", "SEWAGE TREATED")}</small>
                  <strong>{telemetry.sewageTreatedM3.toLocaleString()} m³/d</strong>
                </div>
                <div>
                  <small>{t("消防安全率", "FIRE SAFETY")}</small>
                  <strong>{effectiveFireSafety}%</strong>
                </div>
                <div>
                  <small>{t("邮轮在港游客", "CRUISE GUESTS")}</small>
                  <strong>{telemetry.cruisePassengers.toLocaleString()}</strong>
                </div>
              </div>
              <div className="policy-list">
                {policyItems.map((item) => {
                  const active = policies[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`policy-toggle-row${active ? " is-on" : ""}`}
                      aria-pressed={active}
                      onClick={() => togglePolicy(item.id)}
                    >
                      <span className="policy-check" aria-hidden="true">
                        {active && <Check size={10} />}
                      </span>
                      <span className="policy-copy">
                        <strong>{item.title}</strong>
                        <small>{item.effect}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="skylines-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "incidents"}
              className={tab === "incidents" ? "is-active" : ""}
              onClick={() => setTab("incidents")}
            >
              <Radio size={11} />
              <span>{t("此刻发生", "Happening now")}</span>
              <em>{incidents.length}</em>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "infra"}
              className={tab === "infra" ? "is-active" : ""}
              onClick={() => setTab("infra")}
            >
              <Wind size={11} />
              <span>{t("基建与住区", "Infra & Zones")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chirper"}
              className={tab === "chirper" ? "is-active" : ""}
              onClick={() => setTab("chirper")}
            >
              <MessageCircle size={11} />
              <span>{t("市民啾啾", "Chirper")}</span>
            </button>
          </div>

          {tab === "incidents" && (
            <div className="skylines-tab-body">
              <div className="skylines-incident-list">
                {incidents.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`skylines-incident-card is-${item.kind} severity-${item.severity}`}
                    onClick={() => focusIncident(item)}
                  >
                    <div className="incident-card-top">
                      <span className={`incident-code is-${item.kind}`}>
                        {incidentIcon(item.kind)}
                        {item.code}
                      </span>
                      <strong className="incident-title">{item.title}</strong>
                      <ChevronRight size={12} className="incident-arrow" />
                    </div>
                    <div className="incident-card-meta">
                      <span className="incident-loc">{item.locationName}</span>
                      <span className="incident-phase">{item.phaseLabel}</span>
                    </div>
                    <p className="incident-detail">{item.detail}</p>
                    <span className="incident-progress" aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.max(8, Math.round(item.progress * 100))}%`,
                        }}
                      />
                    </span>
                  </button>
                ))}
              </div>

              <div className="skylines-street-chips">
                {[
                  {
                    label: t("🛒 鲜活超市采购", "🛒 Supermarket"),
                    x: -120,
                    z: 86.5,
                    distance: 26,
                    height: 2.0,
                  },
                  {
                    label: t("🚦 斑马线等红灯", "🚦 Crosswalk"),
                    x: -75,
                    z: 89.5,
                    distance: 28,
                    height: 1.8,
                  },
                  {
                    label: t("🏐 沙滩排球扣杀", "🏐 Beach Volley"),
                    x: -172,
                    z: 119,
                    distance: 29,
                    height: 2.0,
                  },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="street-chip-btn"
                    onClick={() =>
                      onFocusPoint({
                        x: chip.x,
                        z: chip.z,
                        distance: chip.distance,
                        height: chip.height,
                      })
                    }
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "infra" && (
            <div className="skylines-tab-body">
              <div className="skylines-infra-list">
                {infraLandmarks.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    className={`skylines-infra-card accent-${spot.accent}`}
                    onClick={() =>
                      onFocusPoint({
                        x: spot.x,
                        z: spot.z,
                        distance: spot.distance,
                        height: spot.height,
                      })
                    }
                  >
                    <span className={`infra-icon accent-${spot.accent}`}>
                      {spot.icon}
                    </span>
                    <span className="infra-copy">
                      <strong>
                        {spot.title}
                        <em>{spot.badge}</em>
                      </strong>
                      <small>{spot.desc}</small>
                    </span>
                    <ChevronRight size={12} className="incident-arrow" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "chirper" && (
            <div className="skylines-tab-body">
              <div className="skylines-chirp-list">
                {chirps.map((chirp) => (
                  <button
                    key={chirp.id}
                    type="button"
                    className={`skylines-chirp-card mood-${chirp.mood}`}
                    onClick={() =>
                      onFocusPoint({
                        x: chirp.x,
                        z: chirp.z,
                        distance: 42,
                        height: 6,
                      })
                    }
                  >
                    <div className="chirp-header">
                      <strong>{chirp.author}</strong>
                      <span>{chirp.handle}</span>
                      <em>{chirp.tag}</em>
                    </div>
                    <p>{chirp.text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
