"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Compass,
  Crosshair,
  Github,
  HelpCircle,
  Layers,
  Map,
  MapPin,
  Maximize2,
  MessageSquare,
  Minus,
  Moon,
  Navigation,
  Newspaper,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Sun,
  Sunset,
  Aperture,
  X,
  Volume2,
  Gauge,
  VolumeX,
} from "lucide-react";
import { cityBuildings, safeAppUrl, type CityPlace, type PlaceId } from "@/lib/city-content";
import {
  fetchTowerPages,
  TOWER_POLL_MS,
  towerPagesToArchiveFloors,
  towerPagesToFloors,
  type TowerPage,
} from "@/lib/html-tower";
import { CITY_BOUNDS, ROAD_SEGMENTS, cityLots, civicLots, parkLots } from "@/lib/city-map";
import {
  pickLocale,
  type Locale,
} from "@/lib/site-content";
import { CityInformation } from "@/components/city-information";
import { BuildingExperiencePanel } from "@/components/building-experience-panel";
import { CitySkylinesHud } from "@/components/city-skylines-hud";
import { getBuildingExperience } from "@/lib/building-experience";
import { getCityTimeline } from "@/lib/city-events";
import { liveCityIncidents, type CityLifeSnapshot } from "@/lib/real-city/snapshot";
import type { SeasonMode } from "@/lib/city-seasons";
import type { QualityPreference, QualityTier } from "@/lib/real-city/render/quality";

const QUALITY_ORDER: readonly QualityPreference[] = ["auto", "high", "medium", "low"];
const QUALITY_STORAGE_KEY = "sn0vv-city-quality";

const CityScene = dynamic(() => import("@/components/city-scene"), {
  ssr: false,
  loading: () => (
    <div className="world-loading">
      <Building2 size={30} />
      <strong>SN0VV CITY</strong>
      <span>正在载入城市 / LOADING THE CITY</span>
      <i />
    </div>
  ),
});
type Panel = "directory" | "news" | "guestbook" | "about" | null;
type View = "aerial" | "district" | "street";
type Filter = "all" | "occupied" | "vacant";

/** 全屏城市场景；应用目录、公共内容与控制器作为浮层，不占用城市画布。 */
export function LandingPage(): ReactNode {
  const [locale, setLocale] = useState<Locale>("zh");
  const [night, setNight] = useState(false);
  const [golden, setGolden] = useState(false);
  const [tiltShift, setTiltShift] = useState(false);
  const [ambience, setAmbience] = useState(false);
  const [quality, setQuality] = useState<QualityPreference>("auto");
  const [qualityTier, setQualityTier] = useState<QualityTier | null>(null);
  const timeOfDay = night ? "night" : golden ? "golden" : "day";
  const [seasonMode, setSeasonMode] = useState<SeasonMode>("auto");
  const [paused, setPaused] = useState(false);
  const [touring, setTouring] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [zoomKey, setZoomKey] = useState(0);
  const [selected, setSelected] = useState<PlaceId | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setView] = useState<View>("aerial");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; z: number; distance?: number; height?: number }>();
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [experienceChapter, setExperienceChapter] = useState(0);
  const [experienceReplayKey, setExperienceReplayKey] = useState(0);
  const [elevatorPhase, setElevatorPhase] = useState<"open" | "closing" | "moving">("open");
  const [elevatorDirection, setElevatorDirection] = useState<"up" | "down" | "idle">("idle");
  const [elevatorQuery, setElevatorQuery] = useState("");
  const [elevatorNotice, setElevatorNotice] = useState<string | null>(null);
  const [flightApproaching, setFlightApproaching] = useState(false);
  const [hologramCollapsed, setHologramCollapsed] = useState(false);
  const [worldSeconds, setWorldSeconds] = useState(0);
  const [cityLife, setCityLife] = useState<CityLifeSnapshot | null>(null);
  const [towerPages, setTowerPages] = useState<readonly TowerPage[]>([]);
  const elevatorTimersRef = useRef<number[]>([]);
  const wheelCooldownRef = useRef(0);
  const detailRef = useRef<HTMLElement>(null);
  const directoryRef = useRef<HTMLInputElement>(null);
  const directoryTriggerRef = useRef<HTMLButtonElement>(null);
  const informationTriggerRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useCallback((): void => {
    const trigger = informationTriggerRef.current;
    if (trigger?.isConnected && !trigger.classList.contains("city-label")) trigger.focus({ preventScroll: true });
    else directoryTriggerRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY) as QualityPreference | null;
      if (saved && QUALITY_ORDER.includes(saved)) setQuality(saved);
    } catch { /* 隐私模式下不可用，保持自动 */ }
  }, []);
  // 08 号楼：后台上传的 HTML 页面运行时拉取，接在内置 1F/2F 之后（接口不可用时只显示内置楼层）。
  useEffect(() => {
    if (process.env.NODE_ENV === "test" && typeof fetch === "function" && !("mock" in fetch)) return;
    let controller: AbortController | null = null;
    let lastKey = "";
    const load = (): void => {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      fetchTowerPages(request.signal)
        .then((pages) => {
          const key = pages.map((page) => `${page.id}:${page.title}`).join("|");
          if (key === lastKey) return;
          lastKey = key;
          setTowerPages(pages);
        })
        .catch(() => {
          /* 静态预览或服务未部署：保留内置楼层 */
        });
    };
    load();
    const timer = window.setInterval(load, TOWER_POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  const archiveFloors = useMemo(() => towerPagesToArchiveFloors(towerPages), [towerPages]);
  const liveBuildings = useMemo<readonly CityPlace[]>(() => {
    if (!towerPages.length) return cityBuildings;
    const uploaded = towerPagesToFloors(towerPages);
    return cityBuildings.map((building) =>
      building.id === "slot-8" ? { ...building, floors: [...(building.floors ?? []), ...uploaded] } : building,
    );
  }, [towerPages]);
  const zh = locale === "zh";
  const t = (cn: string, en: string): string => (zh ? cn : en);
  const place = liveBuildings.find((building) => building.id === selected);
  const experience = place?.floors?.length ? undefined : getBuildingExperience(selected);
  const lot = cityLots.find((building) => building.id === selected);
  const districtName = lot && lot.x < -75 ? t("西岸老城", "West town") : lot && lot.z < -115 ? t("北部新城", "North quarter") : t("东湾城区", "East bay");
  const occupied = liveBuildings.filter((building) => !building.vacant).length;
  const buildings = liveBuildings.filter(
    (building) =>
      (filter === "all" ||
        (filter === "vacant" ? building.vacant : !building.vacant)) &&
      `${building.name} ${pickLocale(building.category, locale)} ${building.number} ${building.floors?.map((floor) => `${pickLocale(floor.title, locale)} ${pickLocale(floor.category, locale)}`).join(" ") ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    document.documentElement.lang = zh ? "zh-CN" : "en";
  }, [zh]);
  useEffect(() => {
    if (panel === "directory") directoryRef.current?.focus();
    else if (place && !flightApproaching && !detailRef.current?.contains(document.activeElement)) detailRef.current?.focus({ preventScroll: true });
  }, [panel, place, flightApproaching]);
  useEffect(() => {
    return () => {
      elevatorTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setPanel(null);
        setSelected(null);
        setFlightApproaching(false);
        setHelpOpen(false);
        restoreFocus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [restoreFocus]);

  const clearElevatorTimers = useCallback((): void => {
    elevatorTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    elevatorTimersRef.current = [];
  }, []);

  const dispatchElevator = useCallback(
    (nextIndex: number, totalFloors: number, notice?: string): void => {
      if (totalFloors <= 0) return;
      const clamped = Math.max(0, Math.min(totalFloors - 1, nextIndex));
      clearElevatorTimers();
      setElevatorNotice(notice ?? null);
      setActiveFloorIndex((prev) => {
        if (prev === clamped) {
          setElevatorDirection("idle");
          setElevatorPhase("closing");
          const reopenTimer = window.setTimeout(() => {
            setElevatorPhase("open");
          }, 260);
          elevatorTimersRef.current = [reopenTimer];
          return prev;
        }
        setElevatorDirection(clamped > prev ? "up" : "down");
        setElevatorPhase("closing");
        const moveTimer = window.setTimeout(() => {
          setElevatorPhase("moving");
        }, 170);
        const arriveTimer = window.setTimeout(() => {
          setElevatorPhase("open");
          setElevatorDirection("idle");
        }, 660);
        elevatorTimersRef.current = [moveTimer, arriveTimer];
        return clamped;
      });
    },
    [clearElevatorTimers],
  );

  const selectPlace = useCallback((id: PlaceId): void => {
    const trigger = document.activeElement;
    // 场景楼牌在阅读时隐藏；关闭后将键盘焦点交还始终可见的对应入口。
    informationTriggerRef.current = trigger instanceof HTMLButtonElement && !trigger.classList.contains("city-label")
      ? trigger
      : document.querySelector<HTMLElement>(id === "about" ? ".builder-avatar" : `button[data-place="${id}"]`);
    clearElevatorTimers();
    setActiveFloorIndex(0);
    setExperienceChapter(0);
    setExperienceReplayKey(0);
    setFlightApproaching(false);
    setElevatorPhase("open");
    setElevatorDirection("idle");
    setElevatorQuery("");
    setElevatorNotice(null);
    setSelected(id);
    setSelectionKey((value) => value + 1);
    setTouring(false);
    setPanel(id === "news" || id === "guestbook" || id === "about" ? id : null);
    // 选楼只进入空间探索；真实应用链接由导览中的原生链接显式打开。
  }, [clearElevatorTimers]);
  function closeBuilding(): void {
    clearElevatorTimers();
    setSelected(null);
    setFlightApproaching(false);
    restoreFocus();
  }
  function openPanel(next: Panel): void {
    if (next && next !== "directory") {
      selectPlace(next);
      return;
    }
    setSelected(null);
    setPanel((current) => (current === next ? null : next));
  }
  function resetView(): void {
    setPanel(null);
    setSelected(null);
    setFocusPoint(undefined);
    setView("aerial");
    setZoom(1);
    setTouring(false);
    setResetKey((value) => value + 1);
  }
  function locateOnMap(event: MouseEvent<HTMLButtonElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x =
      event.detail === 0
        ? 0
        : CITY_BOUNDS.minX +
          Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
          ) *
            (CITY_BOUNDS.maxX - CITY_BOUNDS.minX);
    const z =
      event.detail === 0
        ? 0
        : CITY_BOUNDS.minZ +
          Math.max(
            0,
            Math.min(1, (event.clientY - bounds.top) / bounds.height),
          ) *
            (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ);
    setFocusPoint({ x, z });
    setPanel(null);
    setSelected(null);
    setTouring(false);
  }

  const informationPlace = panel && panel !== "directory" ? panel : null;
  const isInspecting3DTower = Boolean(place?.floors?.length && panel === null);
  return (
    <main className={`metropolis${night ? " is-night" : ""}${informationPlace ? " has-city-information" : ""}${isInspecting3DTower ? " is-inspecting-3d-tower" : ""}${experience && panel === null ? " is-inspecting-landmark" : ""}`}>
      <button
        className="skip-link"
        type="button"
        onClick={() => openPanel("directory")}
      >
        {t("跳过模型，浏览应用", "Skip to applications")}
      </button>
      <div
        className="world-viewport"
        aria-label={t("完整三维城市", "Interactive 3D metropolis")}
      >
        <CityScene
          selected={selected}
          selectionKey={selectionKey}
          onSelect={selectPlace}
          night={night}
          timeOfDay={timeOfDay}
          tiltShift={tiltShift}
          ambience={ambience}
          quality={quality}
          onQualityTierChange={setQualityTier}
          seasonMode={seasonMode}
          paused={paused}
          resetKey={resetKey}
          zoom={zoom}
          zoomKey={zoomKey}
          onZoomChange={setZoom}
          locale={locale}
          view={view}
          labelsVisible={labelsVisible}
          touring={touring}
          focusPoint={focusPoint}
          activeFloorIndex={activeFloorIndex}
          experienceChapter={experienceChapter}
          experienceReplayKey={experienceReplayKey}
          archiveFloors={archiveFloors}
          onFloorSelect={(floorIdx) => dispatchElevator(floorIdx, place?.floors?.length ?? 2)}
          onFlightChange={setFlightApproaching}
          onWorldTimeChange={setWorldSeconds}
          onCityLifeChange={setCityLife}
          information={informationPlace ? (
            <CityInformation
              place={informationPlace}
              locale={locale}
              onClose={() => {
                setPanel(null);
                setSelected(null);
                informationTriggerRef.current?.focus({ preventScroll: true });
              }}
            />
          ) : null}
        />
      </div>
      <div className="world-vignette" aria-hidden="true" />

      <header className="world-header">
        <button
          className="city-brand"
          type="button"
          onClick={resetView}
          aria-label={t("回到城市总览", "Back to city overview")}
        >
          <span className="city-brand-icon">
            <Building2 size={24} strokeWidth={1.5} />
          </span>
          <span>
            <strong>
              SN0VV<span>CITY</span>
            </strong>
            <small>YOUR PERSONAL METROPOLIS</small>
          </span>
        </button>
        <div className="world-location">
          <span className="location-beacon" />
          <span>{t("自由探索", "FREE EXPLORATION")}</span>
          <i />
          <span>{t("海岸生活", "COASTAL CITY")}</span>
        </div>
        <div className="world-header-actions">
          <button
            className="header-directory"
            type="button"
            aria-expanded={panel === "directory"}
            onClick={() => openPanel("directory")}
          >
            <Building2 size={15} />
            {t("应用目录", "Applications")}
            <span>{liveBuildings.length}</span>
          </button>
          <button
            type="button"
            className="locale-toggle"
            onClick={() => setLocale(zh ? "en" : "zh")}
            aria-label={zh ? "Switch to English" : "切换到中文"}
          >
            {zh ? "EN" : "中"}
          </button>
          <button
            type="button"
            aria-label={t("关于城主", "About the builder")}
            className="builder-avatar"
            onClick={() => openPanel("about")}
          >
            S.
          </button>
        </div>
      </header>

      <section
        className="city-title"
        aria-label={t("当前街区", "Current district")}
      >
        <p>
          <span>01</span> / {t("城市漫游", "CITY EXPLORER")}
        </p>
        <h1>{t("欢迎来到，我的城。", "Welcome to my city.")}</h1>
        <span>
          {t(
            "有人散步，有灯亮起，也有想法在这里生长。",
            "People passing by. Lights coming on. Ideas finding a home.",
          )}
        </span>
      </section>

      <nav className="neighborhood-tour" aria-label={t("漫步街区", "Explore neighborhoods")}>
        <span>{t("去走走", "TAKE A WALK")}</span>
        {[
          { name: t("西岸老城", "West town"), x: -142.5, z: -2.5, distance: 150, height: 7 },
          { name: t("中央公园", "Central park"), x: 0, z: -9, distance: 200, height: 3 },
          { name: t("东湾城区", "East bay"), x: 142.5, z: -12, distance: 170, height: 16 },
          { name: t("北部新城", "North quarter"), x: 60, z: -163, distance: 160, height: 10 },
          { name: t("海边走走", "Beach walk"), x: -153, z: 132, distance: 115, height: 2 },
          { name: t("邮轮母港", "Cruise harbor"), x: 48, z: 178, distance: 86, height: 11 },
          { name: t("货运港口", "Cargo harbor"), x: 235, z: 193, distance: 190, height: 12 },
          { name: t("海景别墅", "Pool villas"), x: -241.5, z: -38, distance: 52, height: 6 },
          { name: t("电力污水厂", "Eco utilities"), x: 266, z: -4, distance: 138, height: 12 },
          { name: t("麦当劳街角", "McDonald's"), x: 168, z: 83, distance: 31, height: 2.5 },
        ].map(({ name, ...point }) => (
          <button key={name} type="button" onClick={() => {
            setFocusPoint(point);
            setSelected(null);
            setPanel(null);
            setTouring(false);
          }}><MapPin size={12} />{name}<ChevronRight size={11} /></button>
        ))}
      </nav>

      <CitySkylinesHud
        cityLife={cityLife}
        worldSeconds={worldSeconds}
        night={night}
        locale={locale}
        seasonMode={seasonMode}
        onSeasonModeChange={setSeasonMode}
        onFocusPoint={(target) => {
          setFocusPoint(target);
          setSelected(null);
          setPanel(null);
          setTouring(false);
        }}
      />

      <div
        className="view-switch"
        role="group"
        aria-label={t("相机视角", "Camera view")}
      >
        {(["aerial", "district", "street"] as const).map((next) => (
          <button
            key={next}
            type="button"
            aria-pressed={view === next}
            onClick={() => {
              if (view === next) setResetKey((value) => value + 1);
              setView(next);
              setPanel(null);
              setSelected(null);
              setFocusPoint(undefined);
              setTouring(false);
            }}
          >
            {next === "aerial" ? (
              <Map size={14} />
            ) : next === "district" ? (
              <Building2 size={14} />
            ) : (
              <Navigation size={14} />
            )}
            <span>
              {next === "aerial"
                ? t("城市俯瞰", "Overview")
                : next === "district"
                  ? t("街区近景", "District")
                  : t("街道视角", "Street")}
            </span>
          </button>
        ))}
      </div>

      <div
        className="camera-tools"
        role="group"
        aria-label={t("地图工具", "Map tools")}
      >
        <button
          type="button"
          aria-label={t("放大", "Zoom in")}
          disabled={zoom >= 2.8}
          onClick={() => {
            setZoom((value) => Math.min(2.8, +(value + 0.2).toFixed(2)));
            setZoomKey((value) => value + 1);
          }}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label={t("缩小", "Zoom out")}
          disabled={zoom <= 0.6}
          onClick={() => {
            setZoom((value) => Math.max(0.6, +(value - 0.2).toFixed(2)));
            setZoomKey((value) => value + 1);
          }}
        >
          <Minus size={18} />
        </button>
        <span />
        <button
          type="button"
          aria-label={t("重置视角", "Reset view")}
          onClick={resetView}
        >
          <Crosshair size={18} />
        </button>
        <button
          type="button"
          aria-label={t("显示楼牌", "Show building labels")}
          aria-pressed={labelsVisible}
          onClick={() => setLabelsVisible((value) => !value)}
        >
          <MapPin size={17} />
        </button>
        <button
          type="button"
          aria-label={t("操作说明", "Controls help")}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((value) => !value)}
        >
          <HelpCircle size={17} />
        </button>
      </div>

      {helpOpen && (
        <aside className="help-panel">
          <strong>{t("把城市握在手里", "Explore your city")}</strong>
          <p>
            <span>{t("平移地图", "Pan")}</span>
            <kbd>{t("左键拖动", "Left drag")}</kbd>
          </p>
          <p>
            <span>{t("旋转视角", "Rotate")}</span>
            <kbd>{t("右键拖动", "Right drag")}</kbd>
          </p>
          <p>
            <span>{t("拉近 / 拉远", "Zoom")}</span>
            <kbd>{t("鼠标滚轮 / 双指", "Scroll / pinch")}</kbd>
          </p>
          <p>
            <span>{t("探索建筑", "Explore")}</span>
            <kbd>{t("点击楼宇或楼牌", "Click a building")}</kbd>
          </p>
          <small>
            {t(
              "触屏：单指旋转，双指缩放与移动。",
              "Touch: one finger to orbit, two to zoom and pan.",
            )}
          </small>
        </aside>
      )}

      {panel === "directory" && (
        <aside
          className="directory-panel glass-panel"
          aria-label={t("应用目录", "Applications")}
        >
          <header className="panel-heading">
            <div>
              <span>YOUR NEIGHBORHOOD</span>
              <h2>{t("城市应用目录", "Applications")}</h2>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={t("关闭应用目录", "Close applications")}
            >
              <X size={18} />
            </button>
          </header>
          <label className="directory-search">
            <Search size={16} />
            <input
              ref={directoryRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("搜索应用", "Search applications")}
              placeholder={t("查找应用或门牌号…", "Search a name or address…")}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("清除搜索", "Clear search")}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <div className="directory-filters">
            {(["all", "occupied", "vacant"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all"
                  ? t("全部", "All")
                  : value === "occupied"
                    ? t("已入驻", "Projects")
                    : t("预留空间", "Available")}
                <span>
                  {value === "all"
                    ? liveBuildings.length
                    : value === "occupied"
                      ? occupied
                      : liveBuildings.length - occupied}
                </span>
              </button>
            ))}
          </div>
          <div className="directory-list">
            {buildings.map((building) => (
              <button
                className={`directory-building${building.vacant ? " is-vacant" : ""}`}
                key={building.id}
                type="button"
                onClick={() => selectPlace(building.id)}
                aria-label={`${t("探索", "Explore")} ${building.name}`}
                style={{ "--place-color": building.color } as CSSProperties}
              >
                <span className="building-list-icon">
                  <Building2 size={20} strokeWidth={1.6} />
                  <small>{building.number}</small>
                </span>
                <span className="building-list-copy">
                  <strong>
                    {building.name}
                    <i
                      className={`building-status-dot${building.vacant ? " is-vacant" : safeAppUrl(building.href) || building.floors?.length ? " is-online" : " is-standby"}`}
                      aria-hidden="true"
                    />
                  </strong>
                  <small>
                    {building.vacant
                      ? t("预留办公空间", "AVAILABLE SPACE")
                      : pickLocale(building.category, locale).split(" · ")[0]}
                  </small>
                </span>
                <span className="building-list-meta" aria-hidden="true">
                  {building.vacant
                    ? t("待入驻", "OPEN")
                    : building.floors?.length
                      ? t(`${building.floors.length}层`, `${building.floors.length}F`)
                      : safeAppUrl(building.href)
                        ? t("在线", "LIVE")
                        : t("节点", "NODE")}
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
            {buildings.length === 0 && (
              <p className="empty-search" role="status">
                {t(
                  "没有找到这栋楼，换个关键词试试。",
                  "No building found. Try another search.",
                )}
              </p>
            )}
          </div>
          <footer>
            <span className="location-beacon" />
            {t(
              "点击定位楼宇，再进入你的应用。",
              "Locate a building, then open your application.",
            )}
          </footer>
        </aside>
      )}

      {place && panel === null && place.floors?.length && flightApproaching && (
        <div
          className="approaching-hud glass-panel"
          role="status"
          aria-live="polite"
          style={{ "--place-color": place.color } as CSSProperties}
        >
          <span className="approaching-beacon" />
          <div className="approaching-copy">
            <small>CAMERA APPROACHING · BLOCK {place.number}</small>
            <strong>
              {t(
                `正在拉近镜头至 ${place.name}，即将展开大楼楼层与观光电梯…`,
                `Zooming in to ${place.name}, preparing building floors & elevator…`,
              )}
            </strong>
            <div className="approaching-progress">
              <i />
            </div>
          </div>
          <button
            type="button"
            className="approaching-skip"
            onClick={() => setFlightApproaching(false)}
          >
            {t("立即展开", "Expand now")}
          </button>
        </div>
      )}

      {place && panel === null && (!place.floors?.length || !flightApproaching) && (
        <aside
          className={`place-detail${place.floors?.length ? " is-spatial-3d-rig" : experience ? " is-landmark-rig" : " glass-panel"}`}
          data-landmark={experience ? place.id : undefined}
          ref={detailRef}
          tabIndex={-1}
          aria-label={t("建筑详情", "Building details")}
          style={{ "--place-color": place.color } as CSSProperties}
        >
          {experience ? (
            <BuildingExperiencePanel
              place={place}
              experience={experience}
              locale={locale}
              chapter={experienceChapter}
              approaching={flightApproaching}
              onChapterChange={setExperienceChapter}
              onReplay={() => setExperienceReplayKey((value) => value + 1)}
              onClose={closeBuilding}
            />
          ) : place.floors && place.floors.length > 0 ? (() => {
            const floors = place.floors;
            const totalFloors = floors.length;
            const safeIndex = Math.max(0, Math.min(totalFloors - 1, activeFloorIndex));
            const currentFloor = floors[safeIndex] ?? floors[0]!;
            // 建筑立面从顶层(最高层)向下排列到底层(1F)，与 3D 场景中的实体楼层上下关系一致
            const topDownIndex = totalFloors - 1 - safeIndex;
            const trimmedElevatorQuery = elevatorQuery.trim().toLowerCase();
            const matchedFloors = trimmedElevatorQuery
              ? floors
                  .map((item, idx) => ({ item, idx }))
                  .filter(({ item, idx }) => {
                    const hay = `${item.floor} ${idx + 1} ${idx + 1}f ${idx + 1}楼 ${pickLocale(item.title, locale)} ${pickLocale(item.category, locale)} ${pickLocale(item.description, locale)}`.toLowerCase();
                    return hay.includes(trimmedElevatorQuery);
                  })
              : [];

            const handleElevatorSubmit = (event: FormEvent<HTMLFormElement>): void => {
              event.preventDefault();
              if (!trimmedElevatorQuery) {
                setElevatorNotice(
                  t(
                    "请输入楼层号（如 1F、2F）或页面关键词（如 LoRA、Biglink）",
                    "Enter a floor (1F, 2F) or keyword (LoRA, Biglink)",
                  ),
                );
                return;
              }
              const targetMatch = matchedFloors[0];
              if (!targetMatch) {
                setElevatorNotice(
                  t(
                    `未找到匹配「${elevatorQuery.trim()}」的楼层，可试试 1F / Biglink / 2F / LoRA`,
                    `No floor matched "${elevatorQuery.trim()}". Try 1F, Biglink, 2F, or LoRA.`,
                  ),
                );
                return;
              }
              setHologramCollapsed(false);
              dispatchElevator(
                targetMatch.idx,
                totalFloors,
                t(
                  `⚡ 电梯已直达 ${targetMatch.item.floor} · ${pickLocale(targetMatch.item.title, locale)}`,
                  `⚡ Elevator dispatched to ${targetMatch.item.floor} · ${pickLocale(targetMatch.item.title, locale)}`,
                ),
              );
            };

            const handleTowerWheel = (event: WheelEvent<HTMLDivElement>): void => {
              if (Math.abs(event.deltaY) < 18) return;
              const now = performance.now();
              if (now - wheelCooldownRef.current < 420) return;
              wheelCooldownRef.current = now;
              if (event.deltaY < 0 && safeIndex < totalFloors - 1) {
                dispatchElevator(safeIndex + 1, totalFloors);
              } else if (event.deltaY > 0 && safeIndex > 0) {
                dispatchElevator(safeIndex - 1, totalFloors);
              }
            };

            return (
              <div className="spatial-3d-layout">
                <div className="spatial-elevator-console glass-panel" onWheel={handleTowerWheel}>
                  <span className="spatial-tether-line is-left" aria-hidden="true" />
                  <div className="spatial-console-header">
                    <div className="spatial-console-title">
                      <small>3D CUTAWAY · BLOCK {place.number}</small>
                      <h2>{place.name}</h2>
                    </div>
                    <div className={`elevator-led-screen is-${elevatorPhase}`}>
                      <span className="led-label">3D LIFT</span>
                      <div className="led-digits">
                        <span className={`led-arrow is-${elevatorDirection}`} aria-hidden="true">
                          {elevatorDirection === "up" ? "▲" : elevatorDirection === "down" ? "▼" : "●"}
                        </span>
                        <strong>{currentFloor.floor.padStart(3, "0")}</strong>
                      </div>
                      <small>
                        {elevatorPhase === "closing"
                          ? t("3D门合拢…", "CLOSING…")
                          : elevatorPhase === "moving"
                            ? t(
                                elevatorDirection === "up" ? "3D轿厢上行…" : "3D轿厢下行…",
                                elevatorDirection === "up" ? "GOING UP…" : "GOING DOWN…",
                              )
                            : t("3D轿厢已开", "DOORS OPEN")}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="spatial-close-btn"
                      aria-label={t("关闭建筑详情", "Close building details")}
                      onClick={() => {
                        setSelected(null);
                        setFlightApproaching(false);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <form
                    className="elevator-search-box"
                    role="search"
                    onSubmit={handleElevatorSubmit}
                  >
                    <div className="elevator-search-header">
                      <Sparkles size={12} aria-hidden="true" />
                      <span>{t("3D 观光电梯搜索 · 直达目标 HTML 楼层", "3D ELEVATOR SEARCH · RIDE TO FLOOR")}</span>
                    </div>
                    <div className="elevator-search-row">
                      <label className="elevator-search-input">
                        <Search size={13} aria-hidden="true" />
                        <input
                          value={elevatorQuery}
                          onChange={(event) => {
                            setElevatorQuery(event.target.value);
                            setElevatorNotice(null);
                          }}
                          aria-label={t("电梯搜索直达", "Elevator floor search")}
                          placeholder={t(
                            "搜 1F / 2F / LoRA / Biglink…",
                            "1F, 2F, LoRA, Biglink…",
                          )}
                        />
                        {elevatorQuery && (
                          <button
                            type="button"
                            aria-label={t("清除电梯搜索", "Clear elevator search")}
                            onClick={() => {
                              setElevatorQuery("");
                              setElevatorNotice(null);
                            }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </label>
                      <button type="submit" className="elevator-dispatch-btn">
                        {t("电梯直达", "Dispatch")}
                      </button>
                    </div>
                    {trimmedElevatorQuery && matchedFloors.length > 0 && (
                      <div className="elevator-search-matches">
                        {matchedFloors.map(({ item, idx }) => (
                          <button
                            key={item.floor}
                            type="button"
                            className="elevator-match-chip"
                            onClick={() => {
                              setHologramCollapsed(false);
                              dispatchElevator(
                                idx,
                                totalFloors,
                                t(
                                  `⚡ 电梯已直达 ${item.floor} · ${pickLocale(item.title, locale)}`,
                                  `⚡ Elevator dispatched to ${item.floor} · ${pickLocale(item.title, locale)}`,
                                ),
                              );
                            }}
                          >
                            <strong>{item.floor}</strong>
                            <span>{pickLocale(item.title, locale)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {elevatorNotice && (
                      <p className="elevator-notice" role="status" aria-live="polite">
                        {elevatorNotice}
                      </p>
                    )}
                  </form>

                  <div
                    className="spatial-floor-caller"
                    role="region"
                    aria-label={t("楼层导览", "Floor directory")}
                  >
                    <div className="spatial-caller-hint">
                      <span>{t("点击中央 3D 楼层模型、滚轮或按呼梯键升降", "CLICK 3D FLOOR, SCROLL OR PRESS BUTTON")}</span>
                    </div>
                    <div className="building-floors-list">
                      {floors
                        .map((item, idx) => ({ item, idx }))
                        .reverse()
                        .map(({ item, idx }) => {
                          const isActive = idx === safeIndex;
                          const floorUrl = safeAppUrl(item.href);
                          return (
                            <div
                              key={item.floor}
                              className={`building-story-row${isActive ? " is-active" : ""}${isActive && elevatorPhase === "open" ? " is-arrived" : ""}`}
                            >
                              <button
                                type="button"
                                className="building-story-select"
                                aria-pressed={isActive}
                                onClick={() => {
                                  setHologramCollapsed(false);
                                  dispatchElevator(idx, totalFloors);
                                }}
                              >
                                <span className="building-floor-badge">
                                  {item.floor}
                                  <small>{isActive ? "3D●" : "↕"}</small>
                                </span>
                                <span className="building-floor-copy">
                                  <small>{pickLocale(item.category, locale)}</small>
                                  <strong>{pickLocale(item.title, locale)}</strong>
                                </span>
                              </button>
                              <a
                                className="building-floor-card"
                                href={floorUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${item.floor} ${pickLocale(item.title, locale)}`}
                                onClick={() => dispatchElevator(idx, totalFloors)}
                              >
                                <span className="sr-only">
                                  {item.floor} {pickLocale(item.title, locale)}
                                </span>
                                <ArrowUpRight size={14} aria-hidden="true" />
                              </a>
                            </div>
                          );
                        })}
                    </div>
                    <button
                      type="button"
                      className="spatial-mode-toggle"
                      onClick={() => setHologramCollapsed((v) => !v)}
                    >
                      {hologramCollapsed
                        ? t("展开右侧 3D 楼层全息 HTML 屏", "Show 3D Floor HTML Hologram")
                        : t("收起全息屏 · 纯享全屏 3D 建筑建模", "Hide Hologram · Full 3D Model View")}
                    </button>
                  </div>
                </div>

                <div className={`spatial-hologram-stage glass-panel${hologramCollapsed ? " is-collapsed" : ""}`}>
                  <span className="spatial-tether-line is-right" aria-hidden="true" />
                  <header className="tower-stage-toolbar">
                    <div className="tower-stage-active-info">
                      <span className="stage-floor-pill">{currentFloor.floor}</span>
                      <div>
                        <strong>{pickLocale(currentFloor.title, locale)}</strong>
                        <small>{pickLocale(currentFloor.category, locale)}</small>
                      </div>
                    </div>
                    <div className="tower-stage-actions">
                      <div className="tower-slide-buttons" role="group" aria-label={t("上下切换楼层", "Switch floor vertically")}>
                        <button
                          type="button"
                          disabled={safeIndex >= totalFloors - 1}
                          onClick={() => dispatchElevator(safeIndex + 1, totalFloors)}
                          aria-label={t("上一层", "Upper floor")}
                        >
                          <ArrowUp size={14} />
                          <span>{t(`上滑 ${floors[safeIndex + 1]?.floor ?? currentFloor.floor}`, `Up ${floors[safeIndex + 1]?.floor ?? currentFloor.floor}`)}</span>
                        </button>
                        <button
                          type="button"
                          disabled={safeIndex <= 0}
                          onClick={() => dispatchElevator(safeIndex - 1, totalFloors)}
                          aria-label={t("下一层", "Lower floor")}
                        >
                          <ArrowDown size={14} />
                          <span>{t(`下滑 ${floors[safeIndex - 1]?.floor ?? currentFloor.floor}`, `Down ${floors[safeIndex - 1]?.floor ?? currentFloor.floor}`)}</span>
                        </button>
                      </div>
                      <a
                        className="button primary tower-open-btn"
                        href={safeAppUrl(currentFloor.href) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("新窗口全屏打开", "Open full page")}
                        <ArrowUpRight size={15} />
                      </a>
                    </div>
                  </header>

                  <div className="tower-html-viewport">
                    <div
                      className={`tower-html-strip is-${elevatorPhase}`}
                      style={
                        {
                          transform: `translate3d(0, -${topDownIndex * 100}%, 0)`,
                        } as CSSProperties
                      }
                    >
                      {floors
                        .slice()
                        .reverse()
                        .map((item) => {
                          const floorUrl = safeAppUrl(item.href);
                          return (
                            <div key={item.floor} className="tower-floor-frame">
                              <div className="tower-floor-watermark" aria-hidden="true">
                                <span>{item.floor}</span>
                                <small>{pickLocale(item.title, locale)}</small>
                              </div>
                              {floorUrl && (
                                <iframe
                                  src={floorUrl}
                                  sandbox={item.sandboxed ? "allow-scripts allow-forms allow-popups allow-modals" : undefined}
                                  referrerPolicy={item.sandboxed ? "no-referrer" : undefined}
                                  title={`${item.floor} - ${pickLocale(item.title, locale)}`}
                                  className="tower-html-iframe"
                                  loading="lazy"
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <>
              <div className="detail-banner">
                <span className="detail-banner-icon" aria-hidden="true">
                  <Building2 size={24} strokeWidth={1.4} />
                </span>
                <span>
                  BLOCK {place.number}
                  <strong>
                    {place.vacant ? "AVAILABLE SPACE" : "PROJECT BUILDING"}
                  </strong>
                </span>
                <button
                  type="button"
                  aria-label={t("关闭建筑详情", "Close building details")}
                  onClick={() => setSelected(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="detail-body">
                <p className="place-category">
                  {pickLocale(place.category, locale)}
                </p>
                <h2>{place.name}</h2>
                <p className="place-description">
                  {pickLocale(place.description, locale)}
                </p>
                <div className="detail-facts">
                  <span>
                    {t("所属街区", "DISTRICT")}
                    <strong>{districtName}</strong>
                  </span>
                  <span>
                    {t("空间编号", "ADDRESS")}
                    <strong>SN-{place.number}</strong>
                  </span>
                  <span>
                    {t("建筑高度", "HEIGHT")}
                    <strong>{lot ? `${lot.height}m` : "24m"}</strong>
                  </span>
                  <span>
                    {t("部署状态", "STATUS")}
                    <strong>
                      {place.vacant
                        ? t("预留空间", "AVAILABLE")
                        : safeAppUrl(place.href)
                          ? t("在线服务", "ONLINE")
                          : t("内部节点", "STANDBY")}
                    </strong>
                  </span>
                </div>
                {safeAppUrl(place.href) ? (
                  <a
                    className="button primary"
                    href={safeAppUrl(place.href)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("进入应用", "Open application")}
                    <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <div className="connection-note">
                    {place.vacant
                      ? t(
                          "这栋楼，留给下一个新想法。",
                          "A home for your next idea.",
                        )
                      : t("应用访问地址待配置", "Application link not configured")}
                  </div>
                )}
                {safeAppUrl(place.sourceHref) && (
                  <a
                    className="source-link"
                    href={safeAppUrl(place.sourceHref)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={14} />
                    {t("查看源码", "View source")}
                    <ArrowUpRight size={13} />
                  </a>
                )}
              </div>
            </>
          )}
        </aside>
      )}

      <div className="map-corner">
        <div className="minimap-topline">
          <span>
            <Navigation size={10} /> N
          </span>
          <span>SN0VV CITY</span>
          <button
            type="button"
            onClick={resetView}
            aria-label={t("小地图回到全景", "Reset from minimap")}
          >
            <Maximize2 size={11} />
          </button>
        </div>
        <button
          className="minimap"
          type="button"
          onClick={locateOnMap}
          aria-label={t("在小地图上定位", "Locate on minimap")}
        >
          <svg
            viewBox={`${CITY_BOUNDS.minX} ${CITY_BOUNDS.minZ} ${CITY_BOUNDS.maxX - CITY_BOUNDS.minX} ${CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect x={CITY_BOUNDS.minX} y={CITY_BOUNDS.minZ} width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX} height={CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ} fill="#314239" />
            <rect x={CITY_BOUNDS.minX} y="114" width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX} height={CITY_BOUNDS.maxZ - 114} fill="#255464" />
            <path d="M-240,145 Q-60,175 160,148 T320,165" fill="none" stroke="#3c7384" strokeWidth="2.5" strokeDasharray="8 6" opacity="0.55" />
            <path d="M-225,107H-80Q-125,183 -225,125Z" fill="#d2be92" />
            <rect x="165" y="115" width="135" height="70" fill="#8f9688" />
            <rect x="266" y="180" width="25" height="78" fill="#8f9688" />
            <rect x="181" y="180" width="22" height="74" fill="#8f9688" />
            {/* 海洋邮轮母港栈桥与航站楼 */}
            <rect x="20" y="114" width="56" height="28" rx="3" fill="#9fb8c9" />
            <rect x="22" y="142" width="52" height="44" rx="2" fill="#899ea8" />
            {/* 东湾污水处理厂（含4座圆形沉淀池）与北湾发电厂（含2座双曲冷却塔） */}
            <rect x="236" y="26" width="56" height="56" rx="4" fill="#5e7975" stroke="#8ab5ae" strokeWidth="1.2" />
            <circle cx="251" cy="41" r="6.5" fill="#2d7b8c" stroke="#cce5ea" strokeWidth="1" />
            <circle cx="277" cy="41" r="6.5" fill="#2d7b8c" stroke="#cce5ea" strokeWidth="1" />
            <circle cx="251" cy="67" r="6.5" fill="#3a6b63" stroke="#cce5ea" strokeWidth="1" />
            <circle cx="277" cy="67" r="6.5" fill="#3a6b63" stroke="#cce5ea" strokeWidth="1" />
            <rect x="238" y="-92" width="60" height="60" rx="4" fill="#6f757c" stroke="#d9aa5b" strokeWidth="1.2" />
            <circle cx="254" cy="-73" r="8" fill="#b8bfc6" stroke="#485058" strokeWidth="1.4" />
            <circle cx="281" cy="-73" r="8" fill="#b8bfc6" stroke="#485058" strokeWidth="1.4" />
            {ROAD_SEGMENTS.map((road, index) => (
              <path key={index} d={`M${road.x1},${road.z1}L${road.x2},${road.z2}`} stroke="#82887b" strokeWidth="8.5" strokeLinecap="square" />
            ))}
            {parkLots.map((park) => (
              <rect key={park.name} x={park.x - park.width / 2} y={park.z - park.depth / 2} width={park.width} height={park.depth} rx="22" fill="#638e66" stroke="#85ad82" strokeWidth="2" />
            ))}
            <ellipse cx="-12" cy="-15" rx="26" ry="37" fill="#4b838e" stroke="#9fc4b4" strokeWidth="1.5" />
            {civicLots.map((lot) => (
              <rect key={lot.kind} x={lot.x - 12} y={lot.z - 12} width="24" height="24" rx="4" fill={lot.kind === "hospital" ? "#d5aaa1" : lot.kind === "stadium" ? "#779986" : "#d2c9a3"} />
            ))}
            {cityLots.map((lot) => (
              <rect
                key={lot.id}
                x={lot.x - lot.width / 2}
                y={lot.z - lot.depth / 2}
                width={lot.width}
                height={lot.depth}
                rx="2.5"
                fill={
                  lot.id === selected
                    ? "#f4ffcf"
                    : lot.vacant
                      ? "#9ba391"
                      : "#a7d8b5"
                }
                stroke={lot.id === selected ? "#ffffff" : "#22342c"}
                strokeWidth={lot.id === selected ? "3" : "1.2"}
              />
            ))}
            {[...liveCityIncidents(cityLife, locale), ...getCityTimeline(worldSeconds, locale)].map((inc) => {
              const color =
                inc.kind === "fire"
                  ? "#ff453a"
                  : inc.kind === "burglar"
                    ? "#3898ff"
                    : inc.kind === "cruise"
                      ? "#5ce0e6"
                      : inc.kind === "medical" || inc.kind === "life"
                        ? "#34d399"
                        : "#f59e0b";
              return (
                <g key={inc.id}>
                  <circle cx={inc.x} cy={inc.z} r="10" fill={color} opacity="0.28" />
                  <circle cx={inc.x} cy={inc.z} r="4.2" fill={color} stroke="#ffffff" strokeWidth="1.1" />
                </g>
              );
            })}
            <circle
              cx={focusPoint?.x ?? 0}
              cy={focusPoint?.z ?? 0}
              r="38"
              fill="rgba(229, 242, 208, 0.06)"
              stroke="#e5f2d0"
              strokeWidth="2.2"
              strokeDasharray="7 4"
            />
            <circle
              cx={focusPoint?.x ?? 0}
              cy={focusPoint?.z ?? 0}
              r="4.5"
              fill="#e5f2d0"
            />
          </svg>
          <span className="map-caption">
            {t("点击地图移动视角", "CLICK TO NAVIGATE")}
          </span>
        </button>
      </div>

      <footer className="city-dock">
        <div className="dock-navigation">
          <button
            type="button"
            aria-label={t("城市总览", "City overview")}
            onClick={resetView}
            className={!panel && !place ? "is-active" : ""}
          >
            <Map size={20} />
            <span>{t("总览", "City")}</span>
          </button>
          <button
            ref={directoryTriggerRef}
            type="button"
            onClick={() => openPanel("directory")}
            aria-pressed={panel === "directory"}
          >
            <Building2 size={20} />
            <span>{t("应用", "Apps")}</span>
          </button>
          <button type="button" data-place="news" onClick={() => selectPlace("news")}>
            <Newspaper size={20} />
            <span>{t("新闻", "Journal")}</span>
          </button>
          <button type="button" data-place="guestbook" onClick={() => selectPlace("guestbook")}>
            <MessageSquare size={20} />
            <span>{t("留言", "Guestbook")}</span>
          </button>
        </div>
        <span className="dock-divider" />
        <div className="dock-scene-controls">
          <button
            type="button"
            aria-label={
              night
                ? t("切换到黄昏", "Switch to sunset")
                : t("切换到夜景", "Switch to night")
            }
            aria-pressed={night}
            onClick={() => {
              // Leaving the night returns to the warm evening light the button promises.
              if (night) setGolden(true);
              setNight((value) => !value);
            }}
          >
            {night ? <Moon size={18} /> : <Sun size={19} />}
            <span>{night ? t("夜景", "Night") : golden ? t("黄昏", "Sunset") : t("白天", "Day")}</span>
          </button>
          <button
            type="button"
            aria-label={golden && !night ? t("切换到白天", "Switch to daylight") : t("切换到黄金时刻", "Switch to golden hour")}
            aria-pressed={golden && !night}
            onClick={() => {
              setGolden(night ? true : (value) => !value);
              setNight(false);
            }}
          >
            <Sunset size={18} />
            <span>{t("光线", "Light")}</span>
          </button>
          <button
            type="button"
            aria-label={t("移轴微缩镜头", "Tilt-shift lens")}
            aria-pressed={tiltShift}
            onClick={() => setTiltShift((value) => !value)}
          >
            <Aperture size={18} />
            <span>{t("移轴", "Tilt")}</span>
          </button>
          <button
            type="button"
            aria-label={ambience ? t("关闭城市环境音", "Mute city ambience") : t("开启城市环境音", "Play city ambience")}
            aria-pressed={ambience}
            onClick={() => setAmbience((value) => !value)}
          >
            {ambience ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{t("声音", "Sound")}</span>
          </button>
          <button
            type="button"
            className="dock-quality"
            data-quality={quality}
            aria-label={t(
              `画质：${qualityLabel(quality, "zh")}${quality === "auto" && qualityTier ? `（当前${qualityLabel(qualityTier, "zh")}）` : ""}，点击切换`,
              `Graphics quality: ${qualityLabel(quality, "en")}${quality === "auto" && qualityTier ? ` (now ${qualityLabel(qualityTier, "en")})` : ""}. Click to change`,
            )}
            title={t("画质：自动 → 高 → 中 → 低", "Quality: auto → high → medium → low")}
            onClick={() => {
              const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(quality) + 1) % QUALITY_ORDER.length];
              setQuality(next);
              try { window.localStorage.setItem(QUALITY_STORAGE_KEY, next); } catch { /* 忽略 */ }
            }}
          >
            <Gauge size={18} />
            <span>{t("画质", "Quality")}</span>
            <b aria-hidden="true">{quality === "auto" ? t("自", "A") : t(qualityLabel(quality, "zh"), qualityLabel(quality, "en").slice(0, 1))}</b>
          </button>
          <button
            type="button"
            aria-label={t("自动航拍", "Cinematic tour")}
            aria-pressed={touring}
            onClick={() => {
              setTouring((value) => !value);
              setPaused(false);
            }}
          >
            <Compass size={19} />
            <span>{t("航拍", "Tour")}</span>
          </button>
          <button
            type="button"
            aria-label={
              paused
                ? t("播放城市动画", "Play city animation")
                : t("暂停城市动画", "Pause city animation")
            }
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
        </div>
        <div className="dock-city-state">
          <span>
            <i />
            {t("持续生长中的数字城市", "A CITY THAT KEEPS GROWING")}
          </span>
          <strong>
            {String(occupied).padStart(2, "0")}{" "}
            <small>{t("个项目", "PROJECTS")}</small>
            <i />
            {String(liveBuildings.length - occupied).padStart(2, "0")}{" "}
            <small>{t("处预留空间", "OPEN SPACES")}</small>
          </strong>
        </div>
      </footer>
      <p className="gesture-hint">
        {t(
          "左键平移 · 右键旋转 · 滚轮缩放",
          "LEFT DRAG TO PAN · RIGHT DRAG TO ORBIT · SCROLL TO ZOOM",
        )}
      </p>
      <a
        className="icp-record"
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        京ICP备2026030364号-1
       · BUILD 0917-1533</a>
    </main>
  );
}

function qualityLabel(value: QualityPreference, locale: "zh" | "en"): string {
  const labels: Record<QualityPreference, [string, string]> = {
    auto: ["自动", "Auto"], high: ["高", "High"], medium: ["中", "Medium"], low: ["低", "Low"],
  };
  return labels[value][locale === "zh" ? 0 : 1];
}
