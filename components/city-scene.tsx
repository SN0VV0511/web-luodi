"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sampleSeasonState, type SeasonMode } from "@/lib/city-seasons";
import { cityBuildings, type PlaceId } from "@/lib/city-content";
import { cityLots } from "@/lib/city-map";
import { buildCityWorld } from "@/lib/city-world";
import { buildArchiveTower3D } from "@/lib/archive-tower-3d";
import { buildCityLandmarks, landmarkCamera } from "@/lib/city-landmarks";
import { getBuildingExperience } from "@/lib/building-experience";
import { parseSnapshot } from "@/lib/quant-board";
import { createAssetBoard, parseAssetSnapshot } from "@/lib/asset-board";
import type { Locale } from "@/lib/site-content";
import type { CityLifeSnapshot } from "@/lib/real-city/snapshot";
import { CityRenderPipeline } from "@/lib/real-city/render/pipeline";
import { CityRenderQuality } from "@/lib/real-city/render/quality";
import { CitySkyEnvironment } from "@/lib/real-city/render/sky-environment";
import { CityShadowController } from "@/lib/real-city/render/shadows";
import { CityPickingIndex } from "@/lib/real-city/render/picking";
import { CityCameraSafety } from "@/lib/real-city/render/camera-safety";
import { CityLocalReflections } from "@/lib/real-city/render/local-reflections";
import { CityGlassOptics } from "@/lib/real-city/render/glass-optics";
import { CityNightWindows } from "@/lib/real-city/render/night-windows";
import { configureCityMaterialSampling } from "@/lib/real-city/render/material-sampling";
import { CityGpuTimer } from "@/lib/real-city/render/gpu-timer";
import { CityModelVisibility } from "@/lib/real-city/render/model-batches";
import { TIME_OF_DAY_GRADES, goldenHourLighting, type TimeOfDay } from "@/lib/real-city/render/time-of-day";

type CityView = "aerial" | "district" | "street";
type CitySceneProps = {
  selected: PlaceId | null;
  selectionKey: number;
  onSelect: (id: PlaceId) => void;
  night: boolean;
  /** Lighting preset; night is still driven by the night flag for every animated subsystem. */
  timeOfDay?: TimeOfDay;
  /** Optional miniature-lens depth of field. */
  tiltShift?: boolean;
  seasonMode?: SeasonMode;
  paused: boolean;
  resetKey: number;
  zoom: number;
  zoomKey: number;
  onZoomChange?: (zoom: number) => void;
  locale: Locale;
  view?: CityView;
  labelsVisible?: boolean;
  touring?: boolean;
  focusPoint?: { x: number; z: number; distance?: number; height?: number };
  activeFloorIndex?: number;
  experienceChapter?: number;
  experienceReplayKey?: number;
  onFloorSelect?: (floorIndex: number) => void;
  onFlightChange?: (flying: boolean) => void;
  onWorldTimeChange?: (seconds: number) => void;
  onCityLifeChange?: (snapshot: CityLifeSnapshot | null) => void;
  onReady?: () => void;
  information?: ReactNode;
};

type SceneHandle = {
  update: () => void;
  reset: () => void;
  zoom: (value: number) => void;
  select: (id: PlaceId | null) => void;
  highlight: (id: PlaceId | null) => void;
  view: (view: CityView) => void;
  focus: (point: { x: number; z: number; distance?: number; height?: number }) => void;
  syncFloor: () => void;
  inspect: (replay?: boolean) => void;
};
type CameraFlight = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetFrom: THREE.Vector3;
  targetTo: THREE.Vector3;
  started: number;
  duration: number;
  place?: PlaceId;
};

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.8;
const CAMERA_VIEWS: Record<CityView, { position: [number, number, number]; target: [number, number, number] }> = {
  aerial: { position: [152, 118, 232], target: [-8, 12, 36] },
  district: { position: [94, 68, 152], target: [-12, 15, 45] },
  street: { position: [-62, 5.8, 108], target: [-18, 8.2, 86] },
};
const defaultLabels = new Set<PlaceId>(["quant", "affine", "agents", "openclaw", "news", "guestbook"]);
const buildingById = new Map(cityBuildings.map((place) => [place.id, place]));
const lotById = new Map(cityLots.map((lot) => [lot.id, lot]));

/** 连续比例的三维城市视口；应用选择与实际导航仍由页面统一处理。 */
export default function CityScene(props: CitySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef(new Map<PlaceId, HTMLButtonElement>());
  const informationRef = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState<PlaceId | null>(null);
  const current = useRef(props);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  current.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setStatus("error");
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.className = "city-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D city. Drag to move, right-drag to orbit, scroll to zoom.");
    container.prepend(renderer.domElement);
    const compactDisplay = window.matchMedia("(max-width: 760px)").matches;
    const renderQuality = new CityRenderQuality(renderer, compactDisplay);
    const renderPipeline = new CityRenderPipeline(renderer, compactDisplay);

    const scene = new THREE.Scene();
    // 每帧在投影标签前统一更新矩阵，后续渲染通道复用结果。
    scene.matrixWorldAutoUpdate = false;
    const fog = new THREE.FogExp2("#c1b7ac", 0.00058);
    scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(43, 1, 0.8, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    const initialView = CAMERA_VIEWS[current.current.view ?? "aerial"];
    camera.position.set(...initialView.position);
    controls.target.set(...initialView.target);
    controls.update();
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.492;
    controls.panSpeed = 0.8;
    controls.rotateSpeed = 0.43;
    controls.zoomSpeed = 0.8;
    controls.screenSpacePanning = false;
    controls.autoRotateSpeed = 0.22;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.cursor.set(0, 0, 0);
    controls.maxTargetRadius = 530;

    const hemisphere = new THREE.HemisphereLight("#c5d7ee", "#6d7a58", 1.55);
    const sun = new THREE.DirectionalLight("#fff3d4", 2.35);
    const seasonSunOffset = new THREE.Vector3(-300, 235, 160);
    sun.position.set(-300, 235, 160);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(renderQuality.state.shadowSize);
    Object.assign(sun.shadow.camera, { left: -305, right: 325, top: 235, bottom: -235, near: 20, far: 860 });
    sun.shadow.normalBias = 0.35;
    sun.shadow.bias = -0.00002;
    sun.shadow.radius = 3.5;
    const shadowController = new CityShadowController(sun, renderQuality.state.shadowSize);
    const fill = new THREE.DirectionalLight("#9cc6f0", 0.38);
    fill.position.set(160, 100, -180);
    scene.add(hemisphere, sun, fill, sun.target);

    const skyUniforms = {
      zenith: { value: new THREE.Color("#2663a6") },
      horizon: { value: new THREE.Color("#ecd8be") },
      ground: { value: new THREE.Color("#a8b8c4") },
      sunColor: { value: new THREE.Color("#fff5da") },
      sunDirection: { value: new THREE.Vector3(-0.84, 0.18, -0.42).normalize() },
      night: { value: 0 },
      uTime: { value: 0 },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vDirection;
        void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDirection;
        uniform vec3 zenith, horizon, ground, sunColor, sunDirection;
        uniform float night, uTime;
        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise2(p);
            p = p * 2.02 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 direction = normalize(vDirection);
          float altitude = direction.y;
          float mu = clamp(altitude, 0.0, 1.0);
          float rayleigh = exp(-mu * 3.2);
          vec3 daySky = mix(zenith, vec3(0.45, 0.67, 0.92), rayleigh);
          daySky = mix(horizon, daySky, smoothstep(-0.02, 0.22, altitude));
          daySky = mix(ground, daySky, smoothstep(-0.2, 0.02, altitude));
          float horizonBand = exp(-abs(altitude - 0.01) * 22.0);
          daySky += vec3(1.0, 0.72, 0.42) * horizonBand * 0.22;
          float sunDistance = max(dot(direction, sunDirection), 0.0);
          daySky += sunColor * pow(sunDistance, 8.0) * 0.35;
          daySky += sunColor * pow(sunDistance, 256.0) * 1.4;
          daySky = mix(daySky, sunColor, smoothstep(0.9996, 0.99995, sunDistance));
          vec3 nightSky = mix(vec3(0.01, 0.02, 0.06), vec3(0.05, 0.1, 0.2), rayleigh);
          nightSky = mix(vec3(0.08, 0.12, 0.22), nightSky, smoothstep(0.0, 0.25, altitude));
          vec3 color = mix(daySky, nightSky, night);
          if (altitude > 0.02) {
            vec2 baseUv = direction.xz / (altitude + 0.12);
            vec2 uvA = baseUv * 0.85 + vec2(uTime * 0.003, uTime * 0.001);
            vec2 uvB = baseUv * 1.7 + vec2(-uTime * 0.004, uTime * 0.002);
            float cumulus = smoothstep(0.48, 0.72, fbm(uvA));
            float wisps = smoothstep(0.55, 0.82, fbm(uvB + 8.0));
            float heightFade = smoothstep(0.02, 0.16, altitude) * (1.0 - smoothstep(0.72, 0.98, altitude));
            float sunShade = mix(0.55, 1.0, pow(sunDistance, 2.0));
            vec3 cloudLit = mix(vec3(0.62, 0.68, 0.76), vec3(1.0, 0.98, 0.94), sunShade);
            vec3 cloudNight = vec3(0.12, 0.16, 0.24);
            vec3 cloudCol = mix(cloudLit, cloudNight, night);
            color = mix(color, cloudCol, cumulus * heightFade * 0.82);
            color = mix(color, cloudCol, wisps * heightFade * 0.28);
          }
          if (night > 0.01 && altitude > 0.04) {
            vec3 starCell = floor(direction * 320.0);
            float starHash = fract(sin(dot(starCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float twinkle = 0.65 + 0.35 * sin(uTime * 1.6 + starHash * 40.0);
            float starMask = smoothstep(0.997, 0.9996, starHash) * smoothstep(0.08, 0.35, altitude);
            color += vec3(0.9, 0.95, 1.0) * starMask * twinkle * night;
          }
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    const skyGeometry = new THREE.SphereGeometry(2200, 32, 16);
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.frustumCulled = false;
    scene.add(sky);

    const environment = new CitySkyEnvironment(renderer, skyGeometry, skyMaterial);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.56;

    let world!: ReturnType<typeof buildCityWorld>;
    let landmarks!: ReturnType<typeof buildCityLandmarks>;
    try {
      world = buildCityWorld({ compact: compactDisplay });
      landmarks = buildCityLandmarks(cityLots);
      scene.add(world.group, landmarks.group);
      world.pickables.push(...landmarks.pickables);
      landmarks.anchors.forEach((anchor, id) => world.anchors.set(id, anchor));
    } catch (error) {
      // 模型初始化失败也释放已创建的 GPU 资源，保留目录中的可访问入口。
      world?.dispose();
      landmarks?.dispose();
      renderer.domElement.dataset.error = error instanceof Error ? error.message : "城市模型初始化失败";
      environment.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      sun.shadow.dispose();
      controls.dispose();
      renderPipeline.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      setStatus("error");
      return;
    }

    const selectionVertices: number[] = [];
    const pushEdge = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      selectionVertices.push(x1, y1, z1, x2, y2, z2);
    };
    // 建筑测绘级双层底座与顶冠折角选中框，取代粗糙的单体包围盒线框
    for (const y of [-0.5, -0.46, 0.46, 0.5]) {
      const r = y === -0.46 ? 0.54 : 0.5;
      pushEdge(-r, y, -r, r, y, -r);
      pushEdge(r, y, -r, r, y, r);
      pushEdge(r, y, r, -r, y, r);
      pushEdge(-r, y, r, -r, y, -r);
    }
    for (const sx of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        pushEdge(sx, -0.5, sz, sx, 0.5, sz);
      }
    }
    const selectionGeometry = new THREE.BufferGeometry();
    selectionGeometry.setAttribute("position", new THREE.Float32BufferAttribute(selectionVertices, 3));
    const selectionMaterial = new THREE.LineBasicMaterial({ color: "#ffe0a3", transparent: true, opacity: 0.92, depthWrite: false });
    const selection = new THREE.LineSegments(selectionGeometry, selectionMaterial);
    selection.visible = false;
    scene.add(selection);

    // 08号楼 · 技术手稿馆 专属可交互 3D 剖面展厅、升降楼层舱与双开门观光电梯模型
    const slot8Lot = lotById.get("slot-8");
    const archiveTower = slot8Lot ? buildArchiveTower3D(slot8Lot) : null;
    if (archiveTower) {
      scene.add(archiveTower.group);
      world.pickables.push(...archiveTower.pickables);
    }
    const pickingIndex = new CityPickingIndex(world.pickables);
    const cameraSafety = new CityCameraSafety(world.builtSites);
    const localReflections = new CityLocalReflections(renderer, scene, world.builtSites, compactDisplay);
    const glassOptics = new CityGlassOptics(scene);
    const nightWindows = new CityNightWindows(scene);
    container.dataset.nightWindows = String(nightWindows.count);
    const materialSampling = configureCityMaterialSampling(scene, renderer, compactDisplay);
    container.dataset.filteredTextures = String(materialSampling.textures);
    const gpuTimer = new CityGpuTimer(renderer);
    const modelVisibility = new CityModelVisibility(scene);
    let lastWheelSwitch = 0;

    // 左牌(billboardSign)动态轮播: 品牌帧/数据帧10秒切换, 数据60秒拉取。
    const assetBoard = createAssetBoard();
    world.billboardSign.material = new THREE.MeshBasicMaterial({ map: assetBoard.texture, toneMapped: false });

    let width = 1;
    let height = 1;
    let visible = true;
    let disposed = false;
    let contextUnavailable = false;
    let hasRendered = false;
    let preparing = true;
    let frameHandle: number | null = null;
    let previousFrame = 0;
    let lastAnimatedTime = -1;
    let lastSeasonMode: SeasonMode | undefined;
    let lastLightingBucket = -1;
    let lastReportedWorldBucket = -1;
    let worldTime = 0;
    let hovered: PlaceId | null = null;
    let boardHovered = false;
    let flight: CameraFlight | null = null;
    let departure: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
    let inspectedId: PlaceId | null = null;
    let referenceDistance = 450;
    let lastReportedZoom = 1;
    let lastOcclusionCheck = -Infinity;
    let labelsDirty = true;
    let lastHoverCheck = 0;
    let lastControlChange = -Infinity;
    const occlusion = new Map<PlaceId, boolean>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const raycaster = new THREE.Raycaster();
    const labelRaycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const projected = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const pointerStart = new THREE.Vector2();
    const activePointers = new Set<number>();
    let tapCandidate = false;
    let lastPointer: { x: number; y: number } | null = null;
    let activeView = current.current.view ?? "aerial";

    function schedule() {
      if (!disposed && !preparing && !contextUnavailable && visible && !document.hidden && frameHandle === null)
        frameHandle = requestAnimationFrame(render);
    }

    function reportZoom(value: number) {
      lastReportedZoom = Math.round(THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM) * 100) / 100;
      if (Math.abs(current.current.zoom - lastReportedZoom) > 0.015)
        current.current.onZoomChange?.(lastReportedZoom);
    }

    function setDistanceLimits() {
      controls.minDistance = referenceDistance / MAX_ZOOM;
      controls.maxDistance = referenceDistance / MIN_ZOOM;
    }

    function flyTo(position: THREE.Vector3, target: THREE.Vector3, immediate = false, place?: PlaceId) {
      setArrived(null);
      const isMultiFloor = Boolean(place && buildingById.get(place)?.floors?.length);
      // 清除上次手势的阻尼余量，飞行不会继续沿旧拖拽方向漂移。
      controls.autoRotate = false;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = !reducedMotion.matches;
      referenceDistance = position.distanceTo(target);
      setDistanceLimits();
      if (immediate || reducedMotion.matches) {
        flight = null;
        camera.position.copy(position);
        cameraSafety.reset(position);
        controls.target.copy(target);
        controls.update();
        setArrived(place ?? null);
        current.current.onFlightChange?.(false);
      } else {
        const duration = isMultiFloor ? 1250 : place && getBuildingExperience(place) ? 1450 : place ? 2200 : 950;
        flight = { from: camera.position.clone(), to: position, targetFrom: controls.target.clone(), targetTo: target, started: performance.now(), duration, place };
        current.current.onFlightChange?.(Boolean(isMultiFloor || place && getBuildingExperience(place)));
        // 飞行途中暂时放宽dolly范围，避免新视角的距离上限截断动画。
        controls.minDistance = 1;
        controls.maxDistance = 1800;
      }
      reportZoom(1);
      renderer.shadowMap.needsUpdate = true;
      lastOcclusionCheck = -Infinity;
      schedule();
    }

    function cameraView(view: CityView, immediate = false) {
      activeView = view;
      departure = null;
      inspectedId = null;
      const preset = CAMERA_VIEWS[view];
      const target = new THREE.Vector3(...preset.target);
      const position = new THREE.Vector3(...preset.position);
      if (width / height < 0.8 && view !== "street")
        position.sub(target).multiplyScalar(view === "aerial" ? 1.36 : 1.12).add(target);
      flyTo(position, target, immediate);
    }

    function updateHighlight() {
      const inspecting = Boolean(getBuildingExperience(current.current.selected));
      controls.mouseButtons.LEFT = inspecting ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      controls.mouseButtons.RIGHT = inspecting ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      const id = current.current.selected ?? hovered;
      const lot = id ? lotById.get(id) : undefined;
      const anchor = id ? world.anchors.get(id) : undefined;
      selection.visible = Boolean(anchor && lot && !(id && getBuildingExperience(id) && current.current.selected === id));
      if (anchor) {
        const buildingHeight = lot?.height ?? Math.max(10, anchor.y - 3);
        selection.scale.set((lot?.width ?? 20) + 1.2, buildingHeight + 1, (lot?.depth ?? 20) + 1.2);
        selection.position.set(anchor.x, buildingHeight / 2 + 0.4, anchor.z);
      }
      for (const [placeId, element] of labelsRef.current) {
        element.classList.toggle("is-selected", placeId === current.current.selected);
        element.classList.toggle("is-hovered", placeId === hovered);
      }
      renderer.domElement.style.cursor = hovered || boardHovered ? "pointer" : "grab";
      lastOcclusionCheck = -Infinity;
      schedule();
    }

    function inspect(replay = false) {
      const id = current.current.selected;
      const lot = id ? lotById.get(id) : undefined;
      // 换楼时章节归零的 effect 可能先运行，须等 select 保存旧镜头后再定位。
      if (!lot || !getBuildingExperience(id) || (!replay && inspectedId !== id)) return;
      if (replay) landmarks.replay(lot.id);
      const pose = landmarkCamera(lot, current.current.experienceChapter ?? 0, width, height);
      flyTo(pose.position, pose.target, false, lot.id);
      if (flight && !replay) flight.duration = 950;
    }

    function select(id: PlaceId | null) {
      updateHighlight();
      if (!id) {
        if (flight?.place) controlsStart();
        setArrived(null);
        if (departure && inspectedId) {
          flyTo(departure.position, departure.target);
          if (reducedMotion.matches) departure = null;
        }
        inspectedId = null;
        current.current.onFlightChange?.(false);
        return;
      }
      if (getBuildingExperience(id)) {
        if (!departure) departure = { position: camera.position.clone(), target: controls.target.clone() };
        inspectedId = id;
        inspect(true);
        return;
      }
      departure = null;
      inspectedId = null;
      const anchor = world.anchors.get(id);
      if (!anchor) return;
      const lot = lotById.get(id);
      if (!lot) {
        // 公共建筑朝向海岸；为建筑上方的阅读卡留白，窄屏也能看完整块牌面。
        const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const objectWidth = id === "about" ? 64 : 22;
        const distance = Math.max(id === "about" ? 150 : 95, objectWidth / (2 * Math.tan(halfFov) * camera.aspect * 0.78));
        const target = anchor.clone();
        target.y += distance * Math.tan(halfFov) * 0.36;
        const position = target.clone().add(new THREE.Vector3(0.12, 0.38, 1).normalize().multiplyScalar(distance));
        flyTo(position, target, false, id);
        return;
      }
      const roof = lot?.height ?? Math.max(14, anchor.y);
      const building = buildingById.get(id);
      if (building?.floors?.length) {
        // 多楼层 3D 展馆特写：拉近镜头直面 3D 建筑剖面、室内高精建模场景与外挂观光电梯，右侧留出 3D 全息投影区
        const floorIdx = THREE.MathUtils.clamp(current.current.activeFloorIndex ?? 0, 0, building.floors.length - 1);
        const targetY = floorIdx === 1 ? 18.0 : 9.2;
        const target = new THREE.Vector3(anchor.x + (width / height >= 0.8 ? 4.8 : 0), targetY, anchor.z + 2.2);
        const closeDir = new THREE.Vector3(-0.2, 0.14, 0.96).normalize();
        const distance = width / height < 0.8 ? 50 : 31;
        const position = closeDir.multiplyScalar(distance).add(target);
        flyTo(position, target, false, id);
        return;
      }
      const target = new THREE.Vector3(anchor.x, roof * 0.5, anchor.z);
      const distance = Math.max(100, roof * 2.4);
      direction.copy(camera.position).sub(controls.target).normalize();
      direction.y = Math.max(0.36, Math.min(direction.y, 0.74));
      direction.normalize();
      const position = direction.clone().multiplyScalar(distance).add(target);
      if (width / height < 0.8) position.sub(target).multiplyScalar(1.3).add(target);
      flyTo(position, target);
    }

    function timeOfDay(): TimeOfDay {
      if (current.current.night) return "night";
      return current.current.timeOfDay === "golden" ? "golden" : "day";
    }

    function applySeasonLighting() {
      const night = current.current.night;
      const mode = timeOfDay();
      const state = sampleSeasonState(worldTime, current.current.seasonMode ?? "auto");
      hemisphere.color.set(night ? "#6889be" : "#d8ecff");
      hemisphere.groundColor.set(night ? "#2c3d52" : "#647a5e");
      // 夜景补光：月光天空光提高，远离路灯的街区仍能看清轮廓与材质（不提亮窗灯与灯池的对比）。
      hemisphere.intensity = night ? 1.08 : 0.78;
      sun.color.copy(state.sunColor);
      if (night) sun.color.set("#8fb0e6");
      seasonSunOffset.copy(state.sunPosition);
      sun.intensity = night ? 0.46 : state.sunIntensity;
      fill.intensity = night ? 0.3 : 0.3;
      renderer.toneMappingExposure = night ? 1.14 : 1.04;
      scene.environmentIntensity = night ? 0.42 : 0.62;
      fog.color.copy(state.fogDayColor);
      if (night) fog.color.set("#0e1d34");
      fog.density = night ? 0.0011 : state.fogDensity;
      skyUniforms.zenith.value.copy(state.skyZenith);
      skyUniforms.horizon.value.copy(state.skyHorizon);
      skyUniforms.ground.value.set(night ? "#112238" : "#9fb2c0");
      if (mode === "golden") {
        const golden = goldenHourLighting();
        seasonSunOffset.copy(golden.sunDirection).multiplyScalar(state.sunPosition.length());
        sun.color.copy(golden.sunColor);
        sun.intensity = golden.sunIntensity;
        hemisphere.color.copy(golden.hemisphereSky);
        hemisphere.groundColor.copy(golden.hemisphereGround);
        hemisphere.intensity = golden.hemisphereIntensity;
        fill.intensity = golden.fillIntensity;
        renderer.toneMappingExposure = golden.exposure;
        scene.environmentIntensity = golden.environmentIntensity;
        fog.color.copy(golden.fogColor);
        fog.density = golden.fogDensity;
        skyUniforms.zenith.value.copy(golden.skyZenith);
        skyUniforms.horizon.value.copy(golden.skyHorizon);
        skyUniforms.ground.value.copy(golden.skyGround);
      }
      sun.position.copy(seasonSunOffset).add(sun.target.position);
      skyUniforms.sunDirection.value.copy(seasonSunOffset).normalize();
      skyUniforms.sunColor.value.copy(sun.color);
      skyUniforms.night.value = night ? 1 : 0;
      environment.update(scene, state, night, worldTime, mode);
      return state;
    }

    function applyLighting() {
      const night = current.current.night;
      applySeasonLighting();
      nightWindows.update(night, worldTime);
      lastAnimatedTime = -1;
      world.setNight(night);
      if (reducedMotion.matches && flight) {
        camera.position.copy(flight.to);
        controls.target.copy(flight.targetTo);
        setArrived(flight.place ?? null);
        flight = null;
        setDistanceLimits();
        current.current.onFlightChange?.(false);
      }
      renderer.shadowMap.needsUpdate = true;
      shadowController.invalidate();
      controls.enableDamping = !reducedMotion.matches;
      updateHighlight();
    }

    function projectLabels(now: number, checkVisibility = true) {
      const checkOcclusion = checkVisibility && now - lastOcclusionCheck > 250;
      if (checkOcclusion) lastOcclusionCheck = now;
      const occupied: { x: number; y: number; width: number }[] = [];
      const labels = [...world.anchors].sort(([a], [b]) =>
        Number(b === current.current.selected || b === hovered) - Number(a === current.current.selected || a === hovered));
      // 先集中读取尺寸，避免逐个写入 transform 后反复触发布局计算。
      const labelWidths = new Map([...labelsRef.current].map(([id, element]) => [id, Math.max(88, element.offsetWidth)]));
      for (const [id, anchor] of labels) {
        const element = labelsRef.current.get(id);
        if (!element) continue;
        const active = id === current.current.selected || id === hovered;
        const knownTenant = Boolean(buildingById.get(id) && !buildingById.get(id)?.vacant);
        projected.copy(anchor).project(camera);
        const inFrame = Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05 && projected.z > -1 && projected.z < 1;
        let show = !current.current.information && !getBuildingExperience(current.current.selected) && current.current.labelsVisible !== false && inFrame && (active || defaultLabels.has(id) || knownTenant);
        if (show && checkOcclusion && !active) {
          const distance = direction.copy(anchor).sub(camera.position).length();
          labelRaycaster.set(camera.position, direction.normalize());
          labelRaycaster.far = Math.max(0, distance - 5);
          occlusion.set(id, pickingIndex.occluded(labelRaycaster));
        }
        if (occlusion.get(id) && !active) show = false;
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        const labelWidth = labelWidths.get(id) ?? 88;
        if (show && !active && occupied.some((other) => Math.abs(y - other.y) < 39 && Math.abs(x - other.x) < (labelWidth + other.width) / 2 + 12))
          show = false;
        if (show) occupied.push({ x, y, width: labelWidth });
        element.style.visibility = show ? "visible" : "hidden";
        element.style.opacity = show ? "1" : "0";
        element.style.pointerEvents = show ? "auto" : "none";
        element.tabIndex = show ? 0 : -1;
        element.setAttribute("aria-hidden", String(!show));
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        element.style.zIndex = active ? "3" : "1";
      }
      const information = informationRef.current;
      const anchor = current.current.selected ? world.anchors.get(current.current.selected) : undefined;
      if (information && anchor) {
        projected.copy(anchor).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        const halfWidth = information.offsetWidth / 2;
        const left = THREE.MathUtils.clamp(x, halfWidth + 16, Math.max(halfWidth + 16, width - halfWidth - 16));
        const bottom = Math.max(Math.min(96 + information.offsetHeight, height - 150), Math.min(y - 28, height - 138));
        information.style.transform = `translate(${left}px, ${bottom}px) translate(-50%, -100%)`;
        information.style.setProperty("--anchor-offset", `${x - left}px`);
        const inFrame = Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2 && projected.z > -1 && projected.z < 1;
        information.dataset.inFrame = String(inFrame);
        information.inert = !inFrame || information.dataset.visible !== "true";
      }
      if (archiveTower && current.current.selected === "slot-8" && container) {
        const { elevatorWorld, floorStageWorld } = archiveTower.getSpatialAnchors(current.current.activeFloorIndex ?? 0);
        projected.copy(elevatorWorld).project(camera);
        const elevX = THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * width, 160, Math.max(220, width * 0.42));
        const elevY = THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * height, 150, Math.max(200, height - 180));
        container.style.setProperty("--elevator-x", `${Math.round(elevX)}px`);
        container.style.setProperty("--elevator-y", `${Math.round(elevY)}px`);

        projected.copy(floorStageWorld).project(camera);
        const stageX = THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * width, Math.min(width * 0.48, 480), Math.max(520, width - 320));
        const stageY = THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * height, 140, Math.max(180, height - 160));
        container.style.setProperty("--floor-stage-x", `${Math.round(stageX)}px`);
        container.style.setProperty("--floor-stage-y", `${Math.round(stageY)}px`);
      }
      labelsDirty = false;
    }

    function render(now: number) {
      frameHandle = null;
      if (disposed || contextUnavailable || !visible || document.hidden) return;
      const elapsed = previousFrame ? Math.min((now - previousFrame) / 1000, 0.08) : 0;
      previousFrame = now;
      const moving = !current.current.paused && !reducedMotion.matches;
      if (moving) worldTime += elapsed;
      controls.autoRotate = Boolean(current.current.touring && moving && !flight);
      if (flight) {
        const progress = Math.min(1, (now - flight.started) / flight.duration);
        const eased = progress ** 3 * (progress * (progress * 6 - 15) + 10);
        camera.position.lerpVectors(flight.from, flight.to, eased);
        controls.target.lerpVectors(flight.targetFrom, flight.targetTo, eased);
        if (progress === 1) {
          setArrived(flight.place ?? null);
          if (!current.current.selected) departure = null;
          flight = null;
          labelsDirty = true;
          setDistanceLimits();
          current.current.onFlightChange?.(false);
        }
      }
      let elevatorAnimating = false;
      if (archiveTower) {
        const isSlot8Selected = current.current.selected === "slot-8";
        const activeIdx = current.current.activeFloorIndex ?? 0;
        elevatorAnimating = archiveTower.animate(elapsed || 0.016, worldTime, isSlot8Selected, activeIdx);
        if (isSlot8Selected && !flight) {
          const desiredTargetY = activeIdx === 1 ? 18.2 : 9.4;
          const dy = desiredTargetY - controls.target.y;
          if (Math.abs(dy) > 0.04) {
            const stepY = dy * Math.min(1, (elapsed || 0.016) * 6.5);
            controls.target.y += stepY;
            camera.position.y += stepY * 0.85;
            elevatorAnimating = true;
            labelsDirty = true;
          }
        }
      }
      const mechanismsAnimating = landmarks.animate(elapsed || .016, worldTime, current.current.selected, current.current.experienceChapter ?? 0, reducedMotion.matches || current.current.paused);
      const controlsChanged = controls.update(elapsed);
      const allowInterior = Boolean(flight || inspectedId || current.current.selected && buildingById.get(current.current.selected)?.floors?.length);
      if (cameraSafety.update(camera, controls.target, allowInterior)) labelsDirty = true;
      const cameraInteracting = activePointers.size > 0 || Boolean(flight)
        || !controls.autoRotate && now - lastControlChange < 160;
      sky.position.copy(camera.position);
      if (worldTime !== lastAnimatedTime || current.current.seasonMode !== lastSeasonMode) {
        skyUniforms.uTime.value = worldTime;
        const season = sampleSeasonState(worldTime, current.current.seasonMode ?? "auto");
        if (Math.floor(worldTime * 4) !== lastLightingBucket || current.current.seasonMode !== lastSeasonMode) {
          applySeasonLighting();
          lastLightingBucket = Math.floor(worldTime * 4);
        }
        world.animate(worldTime, current.current.night, current.current.seasonMode, season);
        glassOptics.update(worldTime, season);
        nightWindows.update(current.current.night, worldTime);
        if (container) {
          container.dataset.season = season.season;
          container.dataset.weather = season.weather.en;
        }
        lastSeasonMode = current.current.seasonMode;
        lastAnimatedTime = worldTime;
        const timeBucket = Math.floor(worldTime * 2);
        if (timeBucket !== lastReportedWorldBucket) {
          lastReportedWorldBucket = timeBucket;
          current.current.onWorldTimeChange?.(worldTime);
          current.current.onCityLifeChange?.(world.getLifeSnapshot?.() ?? null);
        }
      }
      // 调整画布会清空缓冲区，必须在本帧绘制前完成。
      if (renderQuality.observe(now, moving || Boolean(flight) || controlsChanged, gpuTimer.milliseconds)
        && renderer.getPixelRatio() !== renderQuality.state.pixelRatio) {
        renderer.setPixelRatio(renderQuality.state.pixelRatio);
        renderPipeline.resize();
      }
      const shadow = shadowController.update(camera, controls.target, seasonSunOffset, now, moving || Boolean(flight) || controlsChanged);
      scene.updateMatrixWorld();
      modelVisibility.update(camera, renderer.domElement.height, now);
      if (labelsDirty || controlsChanged || flight || elevatorAnimating || now - lastOcclusionCheck >= 1000)
        projectLabels(now, !cameraInteracting);
      if (shadow.needsUpdate) renderer.shadowMap.needsUpdate = true;
      if (!cameraInteracting) {
        localReflections.update(camera, controls.target, now,
          `${timeOfDay()}:${container?.dataset.season}:${container?.dataset.weather}`,
          renderQuality.state.bloom);
      }
      gpuTimer.begin();
      try {
        renderPipeline.focusTarget = controls.target;
        renderPipeline.render(scene, camera, renderQuality.state, current.current.night, { grade: TIME_OF_DAY_GRADES[timeOfDay()], tiltShift: Boolean(current.current.tiltShift) });
      } finally {
        gpuTimer.end();
      }
      if (container && Math.floor(worldTime) !== Number(container.dataset.renderSecond)) {
        const statistics = renderPipeline.snapshot();
        container.dataset.renderSecond = String(Math.floor(worldTime));
        container.dataset.renderCalls = String(statistics.calls);
        container.dataset.renderTriangles = String(statistics.triangles);
        container.dataset.renderEffects = String(statistics.effects);
        container.dataset.gpuMilliseconds = gpuTimer.milliseconds.toFixed(2);
      }
      if (!hasRendered) {
        hasRendered = true;
        setStatus("ready");
        current.current.onReady?.();
      }
      if (moving || controlsChanged || cameraInteracting || flight || elevatorAnimating || mechanismsAnimating) schedule();
    }

    function resize() {
      const previousAspect = width / height;
      width = Math.max(1, container?.clientWidth ?? 1);
      height = Math.max(1, container?.clientHeight ?? 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // 楼牌与操作界面仍以原生分辨率绘制，只限制 WebGL 在高分屏上的像素量。
      renderQuality.resize(width, height, window.devicePixelRatio);
      renderer.setPixelRatio(renderQuality.state.pixelRatio);
      renderer.setSize(width, height);
      renderPipeline.resize();
      if (!hasRendered) cameraView(activeView, true);
      else if (getBuildingExperience(current.current.selected) && Math.abs(previousAspect - camera.aspect) > .05)
        inspect();
      else if (current.current.selected && !lotById.has(current.current.selected) && Math.abs(previousAspect - camera.aspect) > 0.05)
        select(current.current.selected);
      else if ((previousAspect < 0.8) !== (camera.aspect < 0.8) && !current.current.selected)
        cameraView(activeView);
      lastOcclusionCheck = -Infinity;
      schedule();
    }

    function hitDetail(clientX: number, clientY: number): { id: PlaceId | null; floorIndex?: number } {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, (-(clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const intersection = pickingIndex.first(raycaster);
      if (intersection) {
        const id: PlaceId | undefined = intersection.instanceId === undefined
          ? intersection.object.userData.place
          : intersection.object.userData.places?.[intersection.instanceId];
        const floorIndex: number | undefined = intersection.object.userData.floorIndex;
        if (id) return { id, floorIndex };
        // 只有第一个实体可点击，避免穿透未配置建筑点中后方的办公楼。
        return { id: null };
      }
      return { id: null };
    }

    function hit(clientX: number, clientY: number): PlaceId | null {
      return hitDetail(clientX, clientY).id;
    }

    function hitBoard(clientX: number, clientY: number): boolean {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, (-(clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(world.billboardSign, false).length > 0;
    }

    // 大屏独立于城市拾取集合，且遮住身后楼宇时应优先命中。
    function pickAt(clientX: number, clientY: number): { id: PlaceId | null; board: boolean } {
      const overBoard = hitBoard(clientX, clientY);
      return { id: overBoard ? null : hit(clientX, clientY), board: overBoard };
    }

    function pointerMove(event: PointerEvent) {
      if (activePointers.has(event.pointerId) && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6)
        tapCandidate = false;
      if (event.buttons || event.pointerType === "touch") return;
      const now = performance.now();
      if (now - lastHoverCheck < 80) return;
      lastHoverCheck = now;
      lastPointer = { x: event.clientX, y: event.clientY };
      const { id, board: overBoard } = pickAt(event.clientX, event.clientY);
      if (hovered !== id || boardHovered !== overBoard) {
        hovered = id;
        boardHovered = overBoard;
        updateHighlight();
      }
    }

    function pointerDown(event: PointerEvent) {
      activePointers.add(event.pointerId);
      if (activePointers.size === 1) {
        pointerStart.set(event.clientX, event.clientY);
        tapCandidate = event.button === 0;
      } else tapCandidate = false;
      renderer.domElement.style.cursor = "grabbing";
    }

    function pointerUp(event: PointerEvent) {
      const isTap = tapCandidate && activePointers.size === 1 && activePointers.has(event.pointerId);
      activePointers.delete(event.pointerId);
      tapCandidate = false;
      renderer.domElement.style.cursor = hovered || boardHovered ? "pointer" : "grab";
      if (!isTap || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
      if (hitBoard(event.clientX, event.clientY)) {
        window.open("/quantify/", "_blank", "noopener,noreferrer");
        return;
      }
      const { id, floorIndex } = hitDetail(event.clientX, event.clientY);
      if (id) {
        if (id === "slot-8" && current.current.selected === "slot-8" && floorIndex !== undefined) {
          current.current.onFloorSelect?.(floorIndex);
        } else {
          current.current.onSelect(id);
          if (id === "slot-8" && floorIndex !== undefined) {
            current.current.onFloorSelect?.(floorIndex);
          }
        }
      }
    }

    function canvasWheel(event: WheelEvent) {
      if (current.current.selected !== "slot-8" || event.ctrlKey || event.metaKey) return;
      // 当选中 08 号楼且鼠标位于 3D 大楼/场景区域时，滚轮直接上下滑动大楼楼层与 3D 观光电梯
      const totalFloors = buildingById.get("slot-8")?.floors?.length ?? 2;
      const curFloor = current.current.activeFloorIndex ?? 0;
      if (Math.abs(event.deltaY) < 12) return;
      const nextFloor = event.deltaY < 0
        ? Math.min(totalFloors - 1, curFloor + 1)
        : Math.max(0, curFloor - 1);
      if (nextFloor !== curFloor) {
        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (now - lastWheelSwitch > 380) {
          lastWheelSwitch = now;
          current.current.onFloorSelect?.(nextFloor);
        }
      }
    }

    function pointerCancel(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      tapCandidate = false;
    }

    function pointerLeave() {
      hovered = null;
      boardHovered = false;
      lastPointer = null;
      updateHighlight();
    }

    function controlsStart() {
      if (flight) {
        setArrived(flight.place ?? null);
        if (!current.current.selected && !inspectedId) departure = null;
        flight = null;
        referenceDistance = camera.position.distanceTo(controls.target);
        setDistanceLimits();
        reportZoom(1);
        current.current.onFlightChange?.(false);
      }
      schedule();
    }

    function controlsChange() {
      labelsDirty = true;
      lastControlChange = performance.now();
      if (!flight) reportZoom(referenceDistance / Math.max(1, camera.position.distanceTo(controls.target)));
      schedule();
    }

    function controlsEnd() {
      if (lastPointer) {
        ({ id: hovered, board: boardHovered } = pickAt(lastPointer.x, lastPointer.y));
        updateHighlight();
      }
      schedule();
    }

    function visibilityChange() {
      previousFrame = 0;
      renderQuality.suspend();
      if (document.hidden && frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      } else schedule();
    }

    function contextLost(event?: Event) {
      event?.preventDefault();
      contextUnavailable = true;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
      renderer.domElement.hidden = true;
      current.current.onFlightChange?.(false);
      setStatus("error");
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      previousFrame = 0;
      renderQuality.suspend();
      if (!visible && frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      } else schedule();
    });
    intersectionObserver.observe(container);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerCancel);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
    renderer.domElement.addEventListener("wheel", canvasWheel, { passive: false });
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibilityChange);
    reducedMotion.addEventListener("change", applyLighting);
    controls.addEventListener("start", controlsStart);
    controls.addEventListener("change", controlsChange);
    controls.addEventListener("end", controlsEnd);

    sceneRef.current = {
      update: applyLighting,
      reset: () => cameraView(current.current.view ?? "aerial"),
      view: cameraView,
      select,
      inspect,
      focus: (point) => {
        departure = null;
        inspectedId = null;
        const target = new THREE.Vector3(THREE.MathUtils.clamp(point.x, -265, 380), point.height ?? 12, THREE.MathUtils.clamp(point.z, -225, 350));
        const offset = camera.position.clone().sub(controls.target);
        if (point.distance) {
          const isStreetCloseUp = point.distance < 55;
          offset.set(isStreetCloseUp ? 0.36 : 0.6, isStreetCloseUp ? 0.34 : 0.65, 1)
            .normalize()
            .multiplyScalar(point.distance * (width / height < 0.8 ? 1.35 : 1));
        }
        flyTo(target.clone().add(offset), target);
      },
      zoom: (value) => {
        const safeZoom = THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM);
        if (Math.abs(safeZoom - lastReportedZoom) < 0.015) return;
        if (flight?.place) setArrived(flight.place);
        flight = null;
        current.current.onFlightChange?.(false);
        setDistanceLimits();
        direction.copy(camera.position).sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(direction, referenceDistance / safeZoom);
        lastReportedZoom = safeZoom;
        controls.update();
        schedule();
      },
      highlight: (id) => {
        hovered = id;
        updateHighlight();
      },
      syncFloor: () => {
        updateHighlight();
      },
    };
    // 截图与视觉回归用：仅在 URL 带 ?debugCamera 时暴露相机定位接口。
    const debugWindow = window as unknown as {
      __cityCamera?: (position: number[], target: number[]) => void;
      __cityScene?: THREE.Scene;
      __cityPick?: (x: number, y: number) => unknown;
      __cityAdvance?: (seconds: number) => number;
    };
    if (new URLSearchParams(window.location.search).has("debugCamera")) {
      debugWindow.__cityScene = scene;
      debugWindow.__cityAdvance = (seconds) => {
        worldTime += seconds;
        schedule();
        return worldTime;
      };
      debugWindow.__cityPick = (x, y) => {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
        return ray.intersectObjects(scene.children, true).slice(0, 3).map((hit) => {
          const material = (Array.isArray((hit.object as THREE.Mesh).material) ? ((hit.object as THREE.Mesh).material as THREE.Material[])[0] : (hit.object as THREE.Mesh).material) as THREE.MeshStandardMaterial;
          return { name: hit.object.name, type: hit.object.type, material: material?.name, materialType: material?.type, emissiveMap: Boolean(material?.emissiveMap), map: Boolean(material?.map), emissive: material?.emissive?.getHexString?.(), intensity: material?.emissiveIntensity, distance: hit.distance, instance: hit.instanceId, point: hit.point.toArray().map((v) => Math.round(v)) };
        });
      };
      debugWindow.__cityCamera = (position, target) => {
        flyTo(new THREE.Vector3(position[0], position[1], position[2]), new THREE.Vector3(target[0], target[1], target[2]), true);
        controls.minDistance = 0.5;
        controls.maxDistance = 2000;
        renderer.shadowMap.needsUpdate = true;
        shadowController.invalidate();
        schedule();
      };
    }
    // 行情大屏每分钟拉取一次同源静态快照；失败保留上一幅画面，连续失败才提示维护。
    const boardAbort = new AbortController();
    let boardStopped = false;
    let boardFailures = 0;
    const refreshBoard = async () => {
      if (boardStopped || document.hidden) return;
      try {
        const response = await fetch("/quantify/api/public/positions", { signal: boardAbort.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`positions ${response.status}`);
        const data = parseSnapshot(await response.json());
        if (!data) throw new Error("positions payload invalid");
        boardFailures = 0;
        assetBoard.update(data);
      } catch (error) {
        if (boardAbort.signal.aborted) return;
        boardFailures += 1;
        if (boardFailures >= 2) assetBoard.update(null);
      }
    };
    void refreshBoard();
    const boardTimer = window.setInterval(() => { void refreshBoard(); }, 60_000);

    applyLighting();
    resize();
    // 让驱动并行准备着色器，避免首帧集中编译阻塞界面；卸载后不再启动渲染。
    void Promise.resolve().then(() => {
      if (!disposed) return renderer.compileAsync(scene, camera);
    }).then(() => {
      preparing = false;
      schedule();
    }).catch(() => {
      if (!disposed) {
        preparing = false;
        contextLost();
      }
    });

    return () => {
      disposed = true;
      sceneRef.current = null;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      controls.removeEventListener("start", controlsStart);
      controls.removeEventListener("change", controlsChange);
      controls.removeEventListener("end", controlsEnd);
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("wheel", canvasWheel);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibilityChange);
      reducedMotion.removeEventListener("change", applyLighting);
      boardStopped = true;
      boardAbort.abort();
      window.clearInterval(boardTimer);
      assetBoard.dispose();
      archiveTower?.dispose();
      pickingIndex.dispose();
      localReflections.dispose();
      gpuTimer.dispose();
      landmarks.dispose();
      world.dispose();
      selectionGeometry.dispose();
      selectionMaterial.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      environment.dispose();
      sun.shadow.dispose();
      renderPipeline.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { sceneRef.current?.update(); }, [props.night, props.timeOfDay, props.tiltShift, props.paused, props.labelsVisible, props.touring, props.locale, props.seasonMode]);
  useEffect(() => { sceneRef.current?.syncFloor(); }, [props.activeFloorIndex]);
  useEffect(() => { sceneRef.current?.inspect(); }, [props.experienceChapter]);
  useEffect(() => { if (props.experienceReplayKey) sceneRef.current?.inspect(true); }, [props.experienceReplayKey]);
  // 动态场景首次就绪后再执行选择，避免载入期间的点击被初始视角覆盖。
  useEffect(() => { if (status === "ready") sceneRef.current?.select(props.selected); }, [props.selected, props.selectionKey, status]);
  useEffect(() => { sceneRef.current?.reset(); }, [props.resetKey]);
  // 滚轮回报只同步界面，只有显式缩放指令才重新设置相机。
  useEffect(() => { sceneRef.current?.zoom(current.current.zoom); }, [props.zoomKey]);
  useEffect(() => { sceneRef.current?.view(props.view ?? "aerial"); }, [props.view]);
  useEffect(() => { if (props.focusPoint) sceneRef.current?.focus(props.focusPoint); }, [props.focusPoint]);

  useEffect(() => {
    if (!(arrived && arrived === props.selected) && status !== "error") return;
    const card = informationRef.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!card) return;
    let focused = false;
    const focus = () => {
      if (focused) return;
      card.focus({ preventScroll: true });
      focused = document.activeElement === card;
    };
    // 淡入首帧可能仍是 visibility:hidden；待样式生效再聚焦，过渡结束兜底。
    const frame = requestAnimationFrame(focus);
    card.addEventListener("transitionend", focus, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener("transitionend", focus);
    };
  }, [arrived, props.selected, status]);

  const destinations: { id: PlaceId; name: string; number?: string; vacant?: boolean; color?: string }[] = [
    ...cityBuildings,
    { id: "news", name: props.locale === "zh" ? "城市日报" : "Daily news", color: "#d49b6a" },
    { id: "guestbook", name: props.locale === "zh" ? "海岸信箱" : "Guestbook", color: "#82b09a" },
    { id: "about", name: "SN0VV", color: "#d6b490" },
  ];

  return (
    <div ref={containerRef} className="city-scene" data-ready={status === "ready"}>
      {status !== "error" && (
        <div className="city-labels">
          {destinations.map((place) => (
            <button
              type="button"
              key={place.id}
              ref={(element) => {
                if (element) labelsRef.current.set(place.id, element);
                else labelsRef.current.delete(place.id);
              }}
              className={`city-label${place.vacant ? " is-vacant" : ""}${props.selected === place.id ? " is-selected" : ""}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                opacity: 0,
                visibility: "hidden",
                "--label-color": place.color ?? "#acd5ad",
              } as CSSProperties}
              aria-label={`${props.locale === "zh" ? "探索" : "Explore"} ${place.name}`}
              aria-pressed={props.selected === place.id}
              onClick={() => props.onSelect(place.id)}
              onPointerEnter={() => sceneRef.current?.highlight(place.id)}
              onPointerLeave={() => sceneRef.current?.highlight(null)}
              onFocus={() => sceneRef.current?.highlight(place.id)}
              onBlur={() => sceneRef.current?.highlight(null)}
            >
              <span className="city-label-dot" aria-hidden="true" />
              {place.number && <span className="city-label-number">{place.number}</span>}
              <span className="city-label-name">{place.name}</span>
            </button>
          ))}
        </div>
      )}
      {props.information && (
        <div
          ref={informationRef}
          className="city-information-anchor"
          data-visible={status === "error" || arrived === props.selected}
          data-fallback={status === "error"}
          inert={status !== "error" && arrived !== props.selected}
        >
          {props.information}
        </div>
      )}
      {status === "loading" && (
        <div className="city-loading" role="status" aria-live="polite">
          <span>SN0VV / METROPOLIS</span><i aria-hidden="true" />
          <p>{props.locale === "zh" ? "正在点亮这座城市…" : "Bringing the city to life…"}</p>
        </div>
      )}
      {status === "error" && (
        <div className="city-scene-fallback" role="status">
          <span className="city-scene-fallback-icon" aria-hidden="true">⌂</span>
          <p>{props.locale === "zh" ? "城市暂时进入平面模式" : "The city is in map mode"}</p>
          <span>{props.locale === "zh" ? "三维场景暂不可用。打开应用目录，仍可探索并访问每一栋楼。" : "3D is unavailable. Open the app directory to explore and visit every building."}</span>
        </div>
      )}
    </div>
  );
}
