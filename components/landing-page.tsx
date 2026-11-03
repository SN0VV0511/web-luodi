"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
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
  X,
} from "lucide-react";
import { cityBuildings, safeAppUrl, type PlaceId } from "@/lib/city-content";
import { CITY_BOUNDS, ROAD_SEGMENTS, cityLots, civicLots, parkLots } from "@/lib/city-map";
import {
  pickLocale,
  type Locale,
} from "@/lib/site-content";
import { CityInformation } from "@/components/city-information";

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
  const [paused, setPaused] = useState(false);
  const [touring, setTouring] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<PlaceId | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setView] = useState<View>("aerial");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; z: number; distance?: number; height?: number }>();
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [elevatorPhase, setElevatorPhase] = useState<"open" | "closing" | "moving">("open");
  const [elevatorDirection, setElevatorDirection] = useState<"up" | "down" | "idle">("idle");
  const [elevatorQuery, setElevatorQuery] = useState("");
  const [elevatorNotice, setElevatorNotice] = useState<string | null>(null);
  const [flightApproaching, setFlightApproaching] = useState(false);
  const elevatorTimersRef = useRef<number[]>([]);
  const wheelCooldownRef = useRef(0);
  const detailRef = useRef<HTMLElement>(null);
  const directoryRef = useRef<HTMLInputElement>(null);
  const informationTriggerRef = useRef<HTMLElement | null>(null);
  const zh = locale === "zh";
  const t = (cn: string, en: string): string => (zh ? cn : en);
  const place = cityBuildings.find((building) => building.id === selected);
  const lot = cityLots.find((building) => building.id === selected);
  const districtName = lot && lot.x < -75 ? t("西岸老城", "West town") : lot && lot.z < -115 ? t("北部新城", "North quarter") : t("东湾城区", "East bay");
  const occupied = cityBuildings.filter((building) => !building.vacant).length;
  const buildings = cityBuildings.filter(
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
    else if (place && !flightApproaching) detailRef.current?.focus({ preventScroll: true });
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
        informationTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

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
    setElevatorPhase("open");
    setElevatorDirection("idle");
    setElevatorQuery("");
    setElevatorNotice(null);
    setSelected(id);
    setSelectionKey((value) => value + 1);
    setTouring(false);
    setPanel(id === "news" || id === "guestbook" || id === "about" ? id : null);
    const target = cityBuildings.find((place) => place.id === id);
    const href = target?.floors?.length ? undefined : safeAppUrl(target?.href);
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [clearElevatorTimers]);
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
  return (
    <main className={`metropolis${night ? " is-night" : ""}${informationPlace ? " has-city-information" : ""}`}>
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
          paused={paused}
          resetKey={resetKey}
          zoom={zoom}
          onZoomChange={setZoom}
          locale={locale}
          view={view}
          labelsVisible={labelsVisible}
          touring={touring}
          focusPoint={focusPoint}
          activeFloorIndex={activeFloorIndex}
          onFlightChange={setFlightApproaching}
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
            <span>{cityBuildings.length}</span>
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
          { name: t("货运港口", "Cargo harbor"), x: 235, z: 193, distance: 190, height: 12 },
        ].map(({ name, ...point }) => (
          <button key={name} type="button" onClick={() => {
            setFocusPoint(point);
            setSelected(null);
            setPanel(null);
            setTouring(false);
          }}><MapPin size={12} />{name}<ChevronRight size={11} /></button>
        ))}
      </nav>

      <aside className="live-scenes-panel" aria-label={t("小镇实时剧场", "Town live vignettes")}>
        <div className="live-scenes-header">
          <span className="live-pulse-dot" />
          <strong>{t("小镇实况近景 · 点击直达现场", "LIVE STREET VIGNETTES")}</strong>
        </div>
        <div className="live-scenes-grid">
          {[
            { badge: "CRASH", title: t("路口追尾与车主争吵", "Car Crash & Dispute"), desc: t("浓烟 · 警车爆闪 · 双方争执", "Smoke, sirens & argument"), x: -73.5, z: 69.5, distance: 25, height: 1.8 },
            { badge: "MART", title: t("鲜活超市推车采购", "Supermarket Shopping"), desc: t("手推购物车 · 蔬果摊挑拣", "3D carts & fresh stalls"), x: -120, z: 86.5, distance: 26, height: 2.0 },
            { badge: "SIGNAL", title: t("红绿灯斑马线过街", "Traffic Light Crossing"), desc: t("红灯驻足等待 · 绿灯通行", "Wait on red, walk on green"), x: -75, z: 89.5, distance: 28, height: 1.8 },
            { badge: "BEACH", title: t("黄金海岸排球对决", "Beach Volleyball"), desc: t("扣球起跳 · 海鸥盘旋", "Spiking & soaring gulls"), x: -172, z: 119, distance: 29, height: 2.0 },
          ].map((scene) => (
            <button
              key={scene.badge}
              type="button"
              className="live-scene-card"
              onClick={() => {
                setFocusPoint({ x: scene.x, z: scene.z, distance: scene.distance, height: scene.height });
                setSelected(null);
                setPanel(null);
                setTouring(false);
              }}
            >
              <span className={`live-scene-badge is-${scene.badge.toLowerCase()}`}>{scene.badge}</span>
              <span className="live-scene-copy">
                <strong>{scene.title}</strong>
                <small>{scene.desc}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

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
          onClick={() =>
            setZoom((value) => Math.min(2.8, +(value + 0.2).toFixed(2)))
          }
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label={t("缩小", "Zoom out")}
          disabled={zoom <= 0.6}
          onClick={() =>
            setZoom((value) => Math.max(0.6, +(value - 0.2).toFixed(2)))
          }
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
                    ? cityBuildings.length
                    : value === "occupied"
                      ? occupied
                      : cityBuildings.length - occupied}
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
          className={`place-detail glass-panel${place.floors?.length ? " is-tower-view" : ""}`}
          ref={detailRef}
          tabIndex={-1}
          aria-label={t("建筑详情", "Building details")}
          style={{ "--place-color": place.color } as CSSProperties}
        >
          {place.floors && place.floors.length > 0 ? (() => {
            const floors = place.floors;
            const totalFloors = floors.length;
            const safeIndex = Math.max(0, Math.min(totalFloors - 1, activeFloorIndex));
            const currentFloor = floors[safeIndex] ?? floors[0]!;
            // 建筑立面从顶层(最高层)向下排列到底层(1F)，符合真实大楼与电梯井物理直觉
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
              <div className="tower-explorer">
                <div className="tower-control-column">
                  <div className="detail-banner">
                    <span className="detail-banner-icon" aria-hidden="true">
                      <Layers size={22} strokeWidth={1.5} />
                    </span>
                    <span>
                      BLOCK {place.number} · {districtName}
                      <strong>MULTI-FLOOR HTML ARCHIVE TOWER</strong>
                    </span>
                    <button
                      type="button"
                      aria-label={t("关闭建筑详情", "Close building details")}
                      onClick={() => {
                        setSelected(null);
                        setFlightApproaching(false);
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="tower-control-body">
                    <div className="tower-title-row">
                      <div>
                        <p className="place-category">{pickLocale(place.category, locale)}</p>
                        <h2>{place.name}</h2>
                      </div>
                      <div className={`elevator-led-screen is-${elevatorPhase}`}>
                        <span className="led-label">ELEVATOR</span>
                        <div className="led-digits">
                          <span className={`led-arrow is-${elevatorDirection}`} aria-hidden="true">
                            {elevatorDirection === "up" ? "▲" : elevatorDirection === "down" ? "▼" : "●"}
                          </span>
                          <strong>{currentFloor.floor.padStart(3, "0")}</strong>
                        </div>
                        <small>
                          {elevatorPhase === "closing"
                            ? t("正在关门…", "CLOSING…")
                            : elevatorPhase === "moving"
                              ? t(
                                  elevatorDirection === "up" ? "电梯上行中…" : "电梯下行中…",
                                  elevatorDirection === "up" ? "GOING UP…" : "GOING DOWN…",
                                )
                              : t("轿厢门已开", "DOORS OPEN")}
                        </small>
                      </div>
                    </div>

                    <form
                      className="elevator-search-box"
                      role="search"
                      onSubmit={handleElevatorSubmit}
                    >
                      <div className="elevator-search-header">
                        <Sparkles size={12} aria-hidden="true" />
                        <span>{t("观光电梯搜索 · 输入关键词或楼层直达对应 HTML", "ELEVATOR SEARCH · JUMP TO FLOOR HTML")}</span>
                      </div>
                      <div className="elevator-search-row">
                        <label className="elevator-search-input">
                          <Search size={14} aria-hidden="true" />
                          <input
                            value={elevatorQuery}
                            onChange={(event) => {
                              setElevatorQuery(event.target.value);
                              setElevatorNotice(null);
                            }}
                            aria-label={t("电梯搜索直达", "Elevator floor search")}
                            placeholder={t(
                              "输入 1F / 2F / LoRA / 微调 / Biglink 直达…",
                              "Search 1F, 2F, LoRA, Biglink…",
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
                              onClick={() =>
                                dispatchElevator(
                                  idx,
                                  totalFloors,
                                  t(
                                    `⚡ 电梯已直达 ${item.floor} · ${pickLocale(item.title, locale)}`,
                                    `⚡ Elevator dispatched to ${item.floor} · ${pickLocale(item.title, locale)}`,
                                  ),
                                )
                              }
                            >
                              <strong>{item.floor}</strong>
                              <span>{pickLocale(item.title, locale)}</span>
                              <small>{t("点击乘梯", "Ride")}</small>
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
                      className="building-cutaway"
                      role="region"
                      aria-label={t("楼层导览", "Floor directory")}
                      onWheel={handleTowerWheel}
                    >
                      <div className="building-roof-cap" aria-hidden="true">
                        <span className={`roof-pulley is-${elevatorPhase}`} />
                        <span>ROOF · {lot ? `${lot.height}M` : "30M"} SKY DECK &amp; HOIST</span>
                        <small>{t("滚轮或点击楼层上下滑动大楼", "SCROLL OR CLICK TO RIDE")}</small>
                      </div>

                      <div className="building-shaft-body">
                        <div
                          className={`elevator-shaft-track is-${elevatorPhase}`}
                          aria-hidden="true"
                          style={
                            {
                              "--elevator-slot": topDownIndex,
                              "--total-slots": totalFloors,
                            } as CSSProperties
                          }
                        >
                          <div className="shaft-guide-rails" />
                          <div className={`shaft-hoist-cables is-${elevatorPhase}`} />
                          {floors
                            .slice()
                            .reverse()
                            .map((item) => (
                              <span key={item.floor} className="shaft-floor-stop">
                                {item.floor}
                              </span>
                            ))}
                          <div className={`elevator-car is-${elevatorPhase}`}>
                            <div className="elevator-car-roof" />
                            <div className="elevator-car-interior">
                              <span>{currentFloor.floor}</span>
                            </div>
                            <div className="elevator-doors">
                              <span className="elevator-door is-left" />
                              <span className="elevator-door is-right" />
                            </div>
                          </div>
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
                                    onClick={() => dispatchElevator(idx, totalFloors)}
                                  >
                                    <span className="building-floor-badge">
                                      {item.floor}
                                      <small>{isActive ? "●" : "↕"}</small>
                                    </span>
                                    <span className="building-floor-copy">
                                      <small>{pickLocale(item.category, locale)}</small>
                                      <strong>{pickLocale(item.title, locale)}</strong>
                                      <span>{pickLocale(item.description, locale)}</span>
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
                      </div>

                      <div className="building-lobby-base" aria-hidden="true">
                        <span>GROUND LOBBY · SN-{place.number}</span>
                        <span>{t(`共 ${totalFloors} 层 HTML 展厅`, `${totalFloors} HTML FLOORS`)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tower-html-stage">
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
                          <span>{t("上滑一层", "Up 1F")}</span>
                        </button>
                        <button
                          type="button"
                          disabled={safeIndex <= 0}
                          onClick={() => dispatchElevator(safeIndex - 1, totalFloors)}
                          aria-label={t("下一层", "Lower floor")}
                        >
                          <ArrowDown size={14} />
                          <span>{t("下滑一层", "Down 1F")}</span>
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
            onClick={() => setNight((value) => !value)}
          >
            {night ? <Moon size={18} /> : <Sun size={19} />}
            <span>{night ? t("夜景", "Night") : t("黄昏", "Sunset")}</span>
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
            {String(cityBuildings.length - occupied).padStart(2, "0")}{" "}
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
