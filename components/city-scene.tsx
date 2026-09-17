"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cityBuildings, type PlaceId } from "@/lib/city-content";
import { cityLots } from "@/lib/city-map";
import { buildCityWorld } from "@/lib/city-world";
import { createQuantBoard, parseSnapshot } from "@/lib/quant-board";
import type { Locale } from "@/lib/site-content";

type CityView = "aerial" | "district" | "street";
type CitySceneProps = {
  selected: PlaceId | null;
  selectionKey: number;
  onSelect: (id: PlaceId) => void;
  night: boolean;
  paused: boolean;
  resetKey: number;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  locale: Locale;
  view?: CityView;
  labelsVisible?: boolean;
  touring?: boolean;
  focusPoint?: { x: number; z: number; distance?: number; height?: number };
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

const FRAME_INTERVAL = 1000 / 30;
const SHADOW_INTERVAL = 1000 / 10;
const MAX_RENDER_PIXELS = 2_000_000;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.8;
const CAMERA_VIEWS: Record<CityView, { position: [number, number, number]; target: [number, number, number] }> = {
  aerial: { position: [310, 450, 665], target: [45, 5, 120] },
  district: { position: [190, 145, 210], target: [5, 5, -15] },
  street: { position: [-75, 5, 80], target: [-75, 2.6, 5] },
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.className = "city-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D city. Drag to move, right-drag to orbit, scroll to zoom.");
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
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

    const hemisphere = new THREE.HemisphereLight("#cad8ee", "#4c5549", 1.0);
    const sun = new THREE.DirectionalLight("#ffd0a0", 2.9);
    sun.position.set(-300, 235, 160);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 240, bottom: -240, near: 20, far: 900 });
    sun.shadow.normalBias = 0.35;
    sun.shadow.bias = -0.00008;
    sun.shadow.radius = 2;
    const fill = new THREE.DirectionalLight("#a4c2e6", 0.28);
    fill.position.set(160, 100, -180);
    scene.add(hemisphere, sun, fill, sun.target);

    const skyUniforms = {
      zenith: { value: new THREE.Color("#6c91b4") },
      horizon: { value: new THREE.Color("#dec3a4") },
      ground: { value: new THREE.Color("#b1b6bb") },
      sunColor: { value: new THREE.Color("#fff0cd") },
      sunDirection: { value: new THREE.Vector3(-0.84, 0.18, -0.42).normalize() },
      night: { value: 0 },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vDirection;
        void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDirection;
        uniform vec3 zenith, horizon, ground, sunColor, sunDirection;
        uniform float night;
        void main() {
          vec3 direction = normalize(vDirection);
          float altitude = direction.y;
          vec3 color = mix(ground, horizon, smoothstep(-0.13, 0.03, altitude));
          color = mix(color, zenith, pow(smoothstep(0.02, 0.8, altitude), 0.72));
          float sunDistance = max(dot(direction, sunDirection), 0.0);
          color += sunColor * pow(sunDistance, 24.0) * 0.08 * (1.0 - night);
          color = mix(color, sunColor, smoothstep(0.99981, 0.99991, sunDistance) * (1.0 - night) * 0.65);
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

    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(environmentScene, 0.035, 0.1, 100, { size: 64 });
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.3;
    environmentScene.dispose();
    pmrem.dispose();

    let world: ReturnType<typeof buildCityWorld>;
    try {
      world = buildCityWorld();
      scene.add(world.group);
    } catch {
      environment.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      sun.shadow.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      setStatus("error");
      return;
    }

    const selectionBox = new THREE.BoxGeometry(1, 1, 1);
    const selectionGeometry = new THREE.EdgesGeometry(selectionBox);
    selectionBox.dispose();
    const selectionMaterial = new THREE.LineBasicMaterial({ color: "#ffd391", transparent: true, opacity: 0.9, depthWrite: false });
    const selection = new THREE.LineSegments(selectionGeometry, selectionMaterial);
    selection.visible = false;
    scene.add(selection);

    // 持仓行情大屏独立于城市实例批次：屏面内容与拾取目标都由模块自己管理。
    const board = createQuantBoard();
    scene.add(board.group);

    let width = 1;
    let height = 1;
    let visible = true;
    let disposed = false;
    let contextUnavailable = false;
    let hasRendered = false;
    let preparing = true;
    let frameHandle: number | null = null;
    let previousFrame = 0;
    let lastShadowFrame = -Infinity;
    let lastAnimatedTime = -1;
    let worldTime = 0;
    let hovered: PlaceId | null = null;
    let boardHovered = false;
    let flight: CameraFlight | null = null;
    let referenceDistance = 450;
    let lastReportedZoom = 1;
    let lastOcclusionCheck = -Infinity;
    let labelsDirty = true;
    let lastHoverCheck = 0;
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
        controls.target.copy(target);
        controls.update();
        setArrived(place ?? null);
      } else {
        flight = { from: camera.position.clone(), to: position, targetFrom: controls.target.clone(), targetTo: target, started: performance.now(), duration: place ? 2200 : 1300, place };
        // 飞行途中暂时放宽dolly范围，避免新视角的距离上限截断动画。
        controls.minDistance = 1;
        controls.maxDistance = 1800;
      }
      reportZoom(1);
      lastOcclusionCheck = -Infinity;
      schedule();
    }

    function cameraView(view: CityView, immediate = false) {
      activeView = view;
      const preset = CAMERA_VIEWS[view];
      const target = new THREE.Vector3(...preset.target);
      const position = new THREE.Vector3(...preset.position);
      if (width / height < 0.8 && view !== "street")
        position.sub(target).multiplyScalar(view === "aerial" ? 1.36 : 1.12).add(target);
      flyTo(position, target, immediate);
    }

    function updateHighlight() {
      const id = current.current.selected ?? hovered;
      const lot = id ? lotById.get(id) : undefined;
      const anchor = id ? world.anchors.get(id) : undefined;
      selection.visible = Boolean(anchor && lot);
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

    function select(id: PlaceId | null) {
      updateHighlight();
      if (!id) {
        if (flight?.place) controlsStart();
        setArrived(null);
        return;
      }
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
      const target = new THREE.Vector3(anchor.x, roof * 0.5, anchor.z);
      const distance = Math.max(100, roof * 2.4);
      direction.copy(camera.position).sub(controls.target).normalize();
      direction.y = Math.max(0.36, Math.min(direction.y, 0.74));
      direction.normalize();
      const position = direction.clone().multiplyScalar(distance).add(target);
      if (width / height < 0.8) position.sub(target).multiplyScalar(1.3).add(target);
      flyTo(position, target);
    }

    function applyLighting() {
      const night = current.current.night;
      hemisphere.color.set(night ? "#7292c4" : "#c4d9ed");
      hemisphere.groundColor.set(night ? "#202c38" : "#718568");
      hemisphere.intensity = night ? 0.75 : 1.3;
      sun.color.set(night ? "#a3bce2" : "#ffd0a0");
      sun.intensity = night ? 0.55 : 2.9;
      fill.intensity = night ? 0.18 : 0.28;
      renderer.toneMappingExposure = night ? 0.87 : 1;
      scene.environmentIntensity = night ? 0.24 : 0.35;
      fog.color.set(night ? "#14253d" : "#d3c6ae");
      fog.density = night ? 0.0012 : 0.00058;
      skyUniforms.zenith.value.set(night ? "#071327" : "#6c91b4");
      skyUniforms.horizon.value.set(night ? "#253d59" : "#dec3a4");
      skyUniforms.ground.value.set(night ? "#17283d" : "#b1b6bb");
      skyUniforms.night.value = night ? 1 : 0;
      world.setNight(night);
      renderer.shadowMap.needsUpdate = true;
      controls.enableDamping = !reducedMotion.matches;
      updateHighlight();
    }

    function projectLabels(now: number) {
      const checkOcclusion = now - lastOcclusionCheck > 250;
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
        let show = !current.current.information && current.current.labelsVisible !== false && inFrame && (active || defaultLabels.has(id) || knownTenant);
        if (show && checkOcclusion && !active) {
          const distance = direction.copy(anchor).sub(camera.position).length();
          labelRaycaster.set(camera.position, direction.normalize());
          labelRaycaster.far = Math.max(0, distance - 5);
          const obstruction = labelRaycaster.intersectObjects(world.pickables, false)[0];
          occlusion.set(id, Boolean(obstruction));
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
      labelsDirty = false;
    }

    function render(now: number) {
      frameHandle = null;
      if (disposed || contextUnavailable || !visible || document.hidden) return;
      // 浏览器时钟会在 33.33ms 两侧抖动，留出 1ms 容差，避免实际掉到 20fps。
      const frameInterval = flight ? 1000 / 60 : FRAME_INTERVAL;
      if (now - previousFrame < frameInterval - 1) {
        schedule();
        return;
      }
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
          flight = null;
          labelsDirty = true;
          setDistanceLimits();
        }
      }
      const controlsChanged = controls.update(elapsed);
      sky.position.copy(camera.position);
      if (worldTime !== lastAnimatedTime) {
        world.animate(worldTime, current.current.night);
        lastAnimatedTime = worldTime;
      }
      scene.updateMatrixWorld();
      if (labelsDirty || controlsChanged || flight || now - lastOcclusionCheck >= 1000) projectLabels(now);
      // 阴影保留动态，每秒更新十次；相机移动不改变世界中的光照投影。
      if (!hasRendered || moving && now - lastShadowFrame >= SHADOW_INTERVAL) {
        renderer.shadowMap.needsUpdate = true;
        lastShadowFrame = now;
      }
      // 持仓大屏始终正对相机(billboard)：任何视角下屏面都朝向观察者。
      board.group.rotation.y = Math.atan2(
        camera.position.x - board.group.position.x,
        camera.position.z - board.group.position.z
      );
      renderer.render(scene, camera);
      if (!hasRendered) {
        hasRendered = true;
        setStatus("ready");
        current.current.onReady?.();
      }
      if (moving || controlsChanged || flight) schedule();
    }

    function resize() {
      const previousAspect = width / height;
      width = Math.max(1, container?.clientWidth ?? 1);
      height = Math.max(1, container?.clientHeight ?? 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // 楼牌与操作界面仍以原生分辨率绘制，只限制 WebGL 在高分屏上的像素量。
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5, Math.sqrt(MAX_RENDER_PIXELS / (width * height))));
      renderer.setSize(width, height);
      if (!hasRendered) cameraView(activeView, true);
      else if (current.current.selected && !lotById.has(current.current.selected) && Math.abs(previousAspect - camera.aspect) > 0.05)
        select(current.current.selected);
      else if ((previousAspect < 0.8) !== (camera.aspect < 0.8) && !current.current.selected)
        cameraView(activeView);
      lastOcclusionCheck = -Infinity;
      schedule();
    }

    function hit(clientX: number, clientY: number): PlaceId | null {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, (-(clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      for (const intersection of raycaster.intersectObjects(world.pickables, false)) {
        const id: PlaceId | undefined = intersection.instanceId === undefined
          ? intersection.object.userData.place
          : intersection.object.userData.places?.[intersection.instanceId];
        if (id) return id;
        // 只有第一个实体可点击，避免穿透未配置建筑点中后方的办公楼。
        return null;
      }
      return null;
    }

    function hitBoard(clientX: number, clientY: number): boolean {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, (-(clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(board.pickTarget, false).length > 0;
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
      const id = hit(event.clientX, event.clientY);
      if (id) current.current.onSelect(id);
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
        flight = null;
        referenceDistance = camera.position.distanceTo(controls.target);
        setDistanceLimits();
        reportZoom(1);
      }
      schedule();
    }

    function controlsChange() {
      labelsDirty = true;
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
      setStatus("error");
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      previousFrame = 0;
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
      focus: (point) => {
        const target = new THREE.Vector3(THREE.MathUtils.clamp(point.x, -240, 380), point.height ?? 12, THREE.MathUtils.clamp(point.z, -225, 350));
        const offset = camera.position.clone().sub(controls.target);
        if (point.distance) offset.set(0.6, 0.65, 1).normalize().multiplyScalar(point.distance * (width / height < 0.8 ? 1.35 : 1));
        flyTo(target.clone().add(offset), target);
      },
      zoom: (value) => {
        const safeZoom = THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM);
        if (Math.abs(safeZoom - lastReportedZoom) < 0.015) return;
        if (flight?.place) setArrived(flight.place);
        flight = null;
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
    };
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
        board.setState({ kind: "data", data });
      } catch (error) {
        if (boardAbort.signal.aborted) return;
        boardFailures += 1;
        if (boardFailures >= 2) board.setState({ kind: "offline" });
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
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibilityChange);
      reducedMotion.removeEventListener("change", applyLighting);
      boardStopped = true;
      boardAbort.abort();
      window.clearInterval(boardTimer);
      board.dispose();
      world.dispose();
      selectionGeometry.dispose();
      selectionMaterial.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      environment.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { sceneRef.current?.update(); }, [props.night, props.paused, props.labelsVisible, props.touring, props.locale]);
  // 动态场景首次就绪后再执行选择，避免载入期间的点击被初始视角覆盖。
  useEffect(() => { if (status === "ready") sceneRef.current?.select(props.selected); }, [props.selected, props.selectionKey, status]);
  useEffect(() => { sceneRef.current?.reset(); }, [props.resetKey]);
  useEffect(() => { sceneRef.current?.zoom(props.zoom); }, [props.zoom]);
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

  const destinations: { id: PlaceId; name: string; number?: string; vacant?: boolean }[] = [
    ...cityBuildings,
    { id: "news", name: props.locale === "zh" ? "城市日报" : "Daily news" },
    { id: "guestbook", name: props.locale === "zh" ? "海岸信箱" : "Guestbook" },
    { id: "about", name: "SN0VV" },
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
              style={{ position: "absolute", left: 0, top: 0, opacity: 0, visibility: "hidden" }}
              aria-label={`${props.locale === "zh" ? "探索" : "Explore"} ${place.name}`}
              aria-pressed={props.selected === place.id}
              onClick={() => props.onSelect(place.id)}
              onPointerEnter={() => sceneRef.current?.highlight(place.id)}
              onPointerLeave={() => sceneRef.current?.highlight(null)}
              onFocus={() => sceneRef.current?.highlight(place.id)}
              onBlur={() => sceneRef.current?.highlight(null)}
            >
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
