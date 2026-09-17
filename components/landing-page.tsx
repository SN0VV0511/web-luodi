"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Compass,
  Crosshair,
  Github,
  HelpCircle,
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
  Sun,
  X,
} from "lucide-react";
import { cityBuildings, cityPlaces, safeAppUrl, type PlaceId } from "@/lib/city-content";
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
      `${building.name} ${pickLocale(building.category, locale)} ${building.number}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    document.documentElement.lang = zh ? "zh-CN" : "en";
  }, [zh]);
  useEffect(() => {
    if (panel === "directory") directoryRef.current?.focus();
    else if (place) detailRef.current?.focus({ preventScroll: true });
  }, [panel, place]);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setPanel(null);
        setSelected(null);
        setHelpOpen(false);
        informationTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  const selectPlace = useCallback((id: PlaceId): void => {
    const trigger = document.activeElement;
    // 场景楼牌在阅读时隐藏；关闭后将键盘焦点交还始终可见的对应入口。
    informationTriggerRef.current = trigger instanceof HTMLButtonElement && !trigger.classList.contains("city-label")
      ? trigger
      : document.querySelector<HTMLElement>(id === "about" ? ".builder-avatar" : `button[data-place="${id}"]`);
    setSelected(id);
    setSelectionKey((value) => value + 1);
    setTouring(false);
    setPanel(id === "news" || id === "guestbook" || id === "about" ? id : null);
    const href = cityPlaces.find((place) => place.id === id)?.href;
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, []);
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
                  <Building2 size={21} />
                  <small>{building.number}</small>
                </span>
                <span>
                  <strong>{building.name}</strong>
                  <small>
                    {building.vacant
                      ? t("预留办公空间", "AVAILABLE SPACE")
                      : pickLocale(building.category, locale).split(" · ")[0]}
                  </small>
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

      {place && panel === null && (
        <aside
          className="place-detail glass-panel"
          ref={detailRef}
          tabIndex={-1}
          aria-label={t("建筑详情", "Building details")}
          style={{ "--place-color": place.color } as CSSProperties}
        >
          <div className="detail-banner">
            <Building2 size={30} strokeWidth={1} />
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
            <rect x={CITY_BOUNDS.minX} y={CITY_BOUNDS.minZ} width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX} height={CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ} fill="#3a493f" />
            <rect x={CITY_BOUNDS.minX} y="115" width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX} height={CITY_BOUNDS.maxZ - 115} fill="#356674" />
            <path d="M-225,107H-80Q-125,183 -225,125Z" fill="#c9b589" />
            <rect x="165" y="115" width="135" height="70" fill="#9a9f8f" />
            <rect x="266" y="180" width="25" height="78" fill="#9a9f8f" />
            {ROAD_SEGMENTS.map((road, index) => (
              <path key={index} d={`M${road.x1},${road.z1}L${road.x2},${road.z2}`} stroke="#939788" strokeWidth="7" />
            ))}
            {parkLots.map((park) => (
              <rect key={park.name} x={park.x - park.width / 2} y={park.z - park.depth / 2} width={park.width} height={park.depth} rx="20" fill="#75a275" />
            ))}
            <ellipse cx="-12" cy="-15" rx="26" ry="37" fill="#588f99" />
            {civicLots.map((lot) => (
              <rect key={lot.kind} x={lot.x - 12} y={lot.z - 12} width="24" height="24" rx="3" fill={lot.kind === "hospital" ? "#d5aaa1" : lot.kind === "stadium" ? "#779986" : "#d2c9a3"} />
            ))}
            {cityLots.map((lot) => (
              <rect
                key={lot.id}
                x={lot.x - lot.width / 2}
                y={lot.z - lot.depth / 2}
                width={lot.width}
                height={lot.depth}
                fill={
                  lot.id === selected
                    ? "#efffcb"
                    : lot.vacant
                      ? "#a9af9b"
                      : "#9fc8ad"
                }
              />
            ))}
            <circle
              cx={focusPoint?.x ?? 0}
              cy={focusPoint?.z ?? 0}
              r="38"
              fill="none"
              stroke="#e5f2d0"
              strokeWidth="2"
              strokeDasharray="7 4"
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
      </a>
    </main>
  );
}
