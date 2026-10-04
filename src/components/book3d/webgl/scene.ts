import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { APERTURE, BOARD_MM, clamp, clampAperture, leafZ, shortestDelta, spineFold, windowPiles, type BookDims } from "@/lib/book/book-model";
import { curlCurve, CURL_LAG, CURL_SEGMENTS } from "@/lib/book/page-curl";
import { RENDER_WINDOW } from "@/lib/book/flipbook";

/** Ключ текстуры: сторона обложки или полоса листа (f — лицевая, b — оборотная). */
export type FaceKey = "front" | "back" | "spine" | `leaf:${number}:f` | `leaf:${number}:b`;

export interface ViewTarget {
  /** Азимут камеры: 0 — спереди, отрицательный — слева (виден корешок). Радианы. */
  azimuth: number;
  /** Полярный угол: π/2 — на уровне книги, 0 — строго сверху. Радианы. */
  polar: number;
  /** Расстояние до книги, мм. */
  distance: number;
}

export interface SceneInit {
  canvas: HTMLCanvasElement;
  dims: BookDims;
  /** Листов блока между обложкой и задней крышкой. */
  leaves: number;
  /** Цвет кромки крышек (по умолчанию — спокойный льняной). */
  edgeColor?: string;
  reducedMotion?: boolean;
}

type FlipHit = "next" | "prev" | null;

const SHADOW_BIAS = -0.0006;

/** Палитра студии: тёплая слоновая кость в тон бумаге сайта — книга выделяется, но фон не спорит с обложкой. */
const STUDIO = { zenith: "#cfbe9f", horizon: "#e8dbc3", floorCenter: "#f6eddc", floorEdge: "#d9c9ad" } as const;
/** Сколько листов вокруг текущей позиции рисуются настоящими изогнутыми плоскостями. */
const WINDOW = RENDER_WINDOW;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

interface Leaf {
  index: number;
  geometry: THREE.BufferGeometry;
  front: THREE.Mesh;
  back: THREE.Mesh;
  frontMat: THREE.MeshStandardMaterial;
  backMat: THREE.MeshStandardMaterial;
  /** Последний нарисованный ход переворота: NaN — геометрия ещё не считалась. */
  drawn: number;
}

/**
 * Книга в WebGL: крышки со скруглёнными кромками, изогнутый корешок, листы, которые гнутся при перевороте, две стопки
 * страниц, физически корректный свет с окружением и мягкие тени. Класс не знает про React: компонент отдаёт ему
 * размеры и текстуры и получает события. Цикл отрисовки работает только пока есть движение.
 */
export class BookScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Расстояние, с которого закрытая книга хорошо видна целиком. */
  readonly baseDistance: number;

  onInteract?: () => void;
  onPick?: (hit: FlipHit) => void;
  onPosition?: (pos: number) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;

  private readonly dims: BookDims;
  private readonly leavesCount: number;
  private readonly world = new THREE.Group();
  private readonly coverPivot = new THREE.Group();
  private readonly coverBoard: THREE.Mesh;
  private readonly backBoard: THREE.Mesh;
  private readonly spine: THREE.Mesh;
  /** Корешок крепится к задней крышке и при раскрытии складывается назад (поворот вокруг своего заднего ребра). */
  private readonly spineHinge = new THREE.Group();
  private readonly pileRight: THREE.Mesh;
  private readonly pileLeft: THREE.Mesh;
  /** Левая стопка лежит на шарнире и поворачивается вместе с раскрытием книги. */
  private readonly leftHinge = new THREE.Group();
  private readonly floor: THREE.Mesh;
  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly contact: THREE.Mesh;
  private readonly contactMat: THREE.MeshBasicMaterial;
  private readonly groundY: number;
  private aperture: number = APERTURE.default;
  private readonly leaves: Leaf[] = [];
  private readonly textures = new Map<FaceKey, THREE.CanvasTexture>();
  private readonly frontMats: THREE.MeshStandardMaterial[];
  private readonly backMats: THREE.MeshStandardMaterial[];
  private readonly spineMat: THREE.MeshStandardMaterial;
  private readonly edgeMat: THREE.MeshStandardMaterial;
  private readonly shadowLight: THREE.DirectionalLight;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly maxAnisotropy: number;

  private pos = 0;
  private flip: null | { from: number; to: number; t0: number; dur: number } = null;
  private tween: null | { from: ViewTarget; to: ViewTarget; t0: number; dur: number } = null;
  private raf = 0;
  private running = true;
  private disposed = false;
  private autoWanted = true;
  private down: null | { x: number; y: number; t: number } = null;
  private readonly reduced: boolean;

  constructor(init: SceneInit) {
    const { canvas, dims, leaves } = init;
    this.dims = dims;
    this.leavesCount = Math.max(1, leaves);
    this.reduced = !!init.reducedMotion;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // Нейтральное тоновое отображение сохраняет цвета обложки и белизну бумаги, не «заваливая» их, как ACES.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.07;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());

    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    // Свет: мягкое окружение даёт объём и блики без «пластика», один направленный источник — тени.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    // Интенсивности подобраны по замеру: освещённая обложка даёт ~94% цвета ткани в текстуре — фактура не «выбеливается».
    this.scene.environmentIntensity = 0.42;
    room.dispose();
    pmrem.dispose();

    const { w: W, h: H, d: D } = dims;
    const key = new THREE.DirectionalLight(0xfff4e6, 1.2);
    // Свет почти сверху и чуть слева-спереди: тень падает коротко назад-вправо, а не длинным «лезвием».
    key.position.set(-W * 0.7, H * 3.3, W * 1.3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const half = Math.max(W, H) * 1.4;
    Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: W * 8 });
    key.shadow.bias = SHADOW_BIAS;
    key.shadow.normalBias = 0.35;
    key.shadow.radius = 9;
    key.target.position.set(0, 0, 0);
    this.scene.add(key, key.target);
    this.shadowLight = key;
    const fill = new THREE.HemisphereLight(0xfff8ee, 0xe3d9c6, 0.28);
    // Слабый встречный свет сзади и справа без теней: обратная сторона и срез не должны проваливаться в темноту.
    const back = new THREE.DirectionalLight(0xf3efe8, 0.75);
    back.position.set(W * 1.8, H * 1.2, -W * 2.2);
    // И отражённый от «стола» свет снизу: когда смотрят снизу, нижний торец и обложки не проваливаются в чёрное.
    const bounce = new THREE.DirectionalLight(0xf6ecda, 0.5);
    bounce.position.set(-W * 0.4, -H * 2, W * 1.2);
    this.scene.add(fill, back, bounce);

    // Камера: лёгкий «телеобъектив» — меньше перспективных искажений страниц.
    const fov = 24;
    this.camera = new THREE.PerspectiveCamera(fov, 1.25, 20, 8000);
    this.baseDistance = H / (1.3 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    this.placeCamera({ azimuth: -0.49, polar: 1.33, distance: this.baseDistance });

    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.rotateSpeed = 0.85;
    c.zoomSpeed = 0.9;
    c.minDistance = this.baseDistance * 0.4;
    c.maxDistance = this.baseDistance * 1.9;
    c.minPolarAngle = 0.02;
    c.maxPolarAngle = Math.PI - 0.02;
    c.autoRotate = !this.reduced;
    c.autoRotateSpeed = 1.1;
    c.addEventListener("start", () => {
      this.autoWanted = false;
      this.tween = null;
      this.onInteract?.();
      this.requestRender();
    });
    c.addEventListener("change", () => this.requestRender());

    // Колёсико мыши меняет масштаб только вместе с Ctrl/⌘ (так же работает щипок на трекпаде), иначе страница
    // перестала бы прокручиваться над моделью. Обработчик стоит раньше OrbitControls и глушит обычное колесо.
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
      },
      { capture: true },
    );
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointerup", this.handleUp);

    // ── Материалы ──
    const edgeColor = new THREE.Color(init.edgeColor ?? "#b9ab93");
    this.edgeMat = this.track(new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.82, metalness: 0 }));
    const endpaper = this.track(new THREE.MeshStandardMaterial({ color: "#eee6d3", roughness: 0.95, metalness: 0 }));
    const cloth = () => this.track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, metalness: 0 }));
    const clothFront = cloth();
    const clothBack = cloth();
    this.spineMat = this.track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0, side: THREE.DoubleSide }));
    // BoxGeometry: +x, −x, +y, −y, +z, −z
    this.frontMats = [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, clothFront, endpaper];
    this.backMats = [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, endpaper, clothBack];

    // ── Крышки: картон толщиной BOARD_MM со скруглёнными кромками ──
    const radius = Math.min(1.1, BOARD_MM * 0.5 - 0.01);
    const boardGeo = this.track(new RoundedBoxGeometry(W, H, BOARD_MM, 3, radius));
    const zBoard = D / 2 - BOARD_MM / 2;
    this.backBoard = new THREE.Mesh(boardGeo, this.backMats);
    this.backBoard.position.z = -zBoard;
    this.backBoard.castShadow = this.backBoard.receiveShadow = true;
    this.backBoard.userData.picks = { 4: "prev" };
    this.coverBoard = new THREE.Mesh(boardGeo, this.frontMats);
    this.coverBoard.position.set(W / 2, 0, zBoard);
    this.coverBoard.castShadow = this.coverBoard.receiveShadow = true;
    this.coverBoard.userData.picks = { 4: "next", 5: "prev" };
    // Передняя крышка откидывается на шарнире — оси корешка.
    this.coverPivot.position.x = -W / 2;
    this.coverPivot.add(this.coverBoard);

    // ── Корешок: изогнутая полоса, соединяющая крышки ──
    this.spine = new THREE.Mesh(this.buildSpineGeometry(), this.spineMat);
    this.spine.castShadow = this.spine.receiveShadow = true;
    this.spineHinge.position.set(-W / 2, 0, -D / 2);
    this.spineHinge.add(this.spine);

    // ── Стопки страниц ──
    const bw = dims.block.w;
    const bh = dims.block.h;
    const lines = this.track(this.stripeTexture("u"));
    const linesV = this.track(this.stripeTexture("v"));
    const paper = this.track(new THREE.MeshStandardMaterial({ color: "#f6f1e6", roughness: 0.95, metalness: 0 }));
    const sideU = this.track(new THREE.MeshStandardMaterial({ map: lines, roughness: 0.95, metalness: 0 }));
    const sideV = this.track(new THREE.MeshStandardMaterial({ map: linesV, roughness: 0.95, metalness: 0 }));
    const pileGeo = this.track(new THREE.BoxGeometry(bw, bh, 1));
    this.pileRight = new THREE.Mesh(pileGeo, [sideU, sideU, sideV, sideV, paper, paper]);
    this.pileLeft = new THREE.Mesh(pileGeo, [sideU, sideU, sideV, sideV, paper, paper]);
    for (const p of [this.pileRight, this.pileLeft]) p.castShadow = p.receiveShadow = true;

    // ── Листы блока ──
    const pageMat = (side: THREE.Side) => this.track(new THREE.MeshStandardMaterial({ color: "#fbf8f1", roughness: 0.92, metalness: 0, side }));
    for (let i = 1; i <= this.leavesCount; i++) {
      const geometry = this.track(this.leafGeometry());
      const frontMat = pageMat(THREE.FrontSide);
      const backMat = pageMat(THREE.BackSide);
      const front = new THREE.Mesh(geometry, frontMat);
      const back = new THREE.Mesh(geometry, backMat);
      front.userData.flip = "next";
      back.userData.flip = "prev";
      for (const m of [front, back]) {
        m.frustumCulled = false;
        m.castShadow = true;
        m.receiveShadow = true;
        m.visible = false;
      }
      this.leaves[i] = { index: i, geometry, front, back, frontMat, backMat, drawn: Number.NaN };
      this.world.add(front, back);
    }

    this.leftHinge.position.x = -W / 2;
    this.leftHinge.add(this.pileLeft);
    this.world.add(this.backBoard, this.spineHinge, this.pileRight, this.leftHinge, this.coverPivot);
    this.scene.add(this.world);

    // ── Студия: купол с градиентом, «стол» с пятном света, туман для глубины, пятно контакта ──
    const groundY = -H / 2 - 0.3;
    this.groundY = groundY;
    this.scene.fog = new THREE.Fog(STUDIO.horizon, this.baseDistance * 2.4, this.baseDistance * 7.5);
    const dome = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(this.baseDistance * 9, 40, 24)),
      this.track(new THREE.MeshBasicMaterial({ map: this.track(this.domeTexture()), side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false })),
    );
    dome.renderOrder = -10;
    this.scene.add(dome);
    this.floorMat = this.track(new THREE.MeshStandardMaterial({ map: this.track(this.floorTexture()), roughness: 0.97, metalness: 0, transparent: true }));
    this.floor = new THREE.Mesh(this.track(new THREE.CircleGeometry(this.baseDistance * 8, 72)), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = groundY;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.contactMat = this.track(new THREE.MeshBasicMaterial({ map: this.track(this.contactTexture()), transparent: true, depthWrite: false, opacity: 0.5 }));
    this.contact = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1, 1)), this.contactMat);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = groundY + 0.05;
    this.contact.scale.set(W * 1.15, D * 5 + 22, 1);
    this.scene.add(this.contact);

    this.apply();
  }

  // ───────────────────────────── публичный интерфейс ─────────────────────────────

  /** Размер холста в CSS-пикселях. */
  resize(width: number, height: number) {
    if (this.disposed || width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Позиция книги: 0 — закрыта, 1 — обложка откинута, дальше — по листу на единицу. */
  setPosition(pos: number) {
    this.flip = null;
    this.pos = pos;
    this.apply();
    this.requestRender();
  }

  /** Плавно листает к позиции `to`. */
  flipTo(to: number, ms: number) {
    if (this.reduced || ms <= 0) return this.setPosition(to);
    this.flip = { from: this.pos, to, t0: performance.now(), dur: ms };
    this.requestRender();
  }

  get position() {
    return this.pos;
  }

  /** Раскрытие книги: доля 180° между половинами (1 — плоско, меньше — «домиком»). */
  setAperture(value: number) {
    const a = clampAperture(value);
    if (a === this.aperture) return;
    this.aperture = a;
    for (const leaf of this.leaves) if (leaf) leaf.drawn = Number.NaN; // форма листов зависит от угла
    this.apply();
    this.requestRender();
  }

  /** Привязывает загруженную картинку к стороне обложки или полосе листа; null снимает её. */
  setTexture(key: FaceKey, canvas: HTMLCanvasElement | null) {
    const old = this.textures.get(key);
    if (old) {
      old.dispose();
      this.textures.delete(key);
    }
    let texture: THREE.CanvasTexture | null = null;
    if (canvas) {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.maxAnisotropy;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      // Оборотная сторона листа видна «с изнанки»: зеркалим по горизонтали, чтобы страница читалась.
      if (key.endsWith(":b")) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
      }
      this.textures.set(key, texture);
    }
    const mat = this.materialFor(key);
    if (mat) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
    this.requestRender();
  }

  hasTexture(key: FaceKey) {
    return this.textures.has(key);
  }

  /** Все ключи, у которых сейчас есть текстура (для освобождения памяти). */
  textureKeys(): FaceKey[] {
    return [...this.textures.keys()];
  }

  setEdgeColor(color: string) {
    this.edgeMat.color.set(color);
    this.requestRender();
  }

  /** Текущий ракурс. */
  getView(): ViewTarget {
    const s = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    return { azimuth: s.theta, polar: s.phi, distance: s.radius };
  }

  /** Плавно (или сразу, при ms = 0) переводит камеру в ракурс. Азимут идёт кратчайшим путём. */
  setView(to: Partial<ViewTarget>, ms = 700) {
    const from = this.getView();
    const target: ViewTarget = {
      azimuth: from.azimuth + shortestDelta((from.azimuth * 180) / Math.PI, ((to.azimuth ?? from.azimuth) * 180) / Math.PI) * (Math.PI / 180),
      polar: clamp(to.polar ?? from.polar, 0.02, Math.PI - 0.02),
      distance: clamp(to.distance ?? from.distance, this.baseDistance * 0.4, this.baseDistance * 1.9),
    };
    if (ms <= 0 || this.reduced) {
      this.tween = null;
      this.placeCamera(target);
    } else {
      this.tween = { from, to: target, t0: performance.now(), dur: ms };
    }
    this.requestRender();
  }

  zoomBy(factor: number) {
    this.setView({ distance: this.getView().distance / factor }, 450);
  }

  setAutoRotate(on: boolean) {
    this.autoWanted = on;
    this.controls.autoRotate = on && !this.reduced;
    this.requestRender();
  }

  /** Остановить/возобновить цикл (книга вне экрана или вкладка скрыта). */
  setActive(active: boolean) {
    this.running = active;
    if (active) this.requestRender();
  }

  requestRender() {
    if (this.disposed || !this.running || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    canvas.removeEventListener("pointerdown", this.handleDown);
    canvas.removeEventListener("pointerup", this.handleUp);
    this.controls.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const d of this.disposables) d.dispose();
    this.scene.environment?.dispose();
    this.shadowLight.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ───────────────────────────── внутреннее устройство ─────────────────────────────

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private placeCamera(v: ViewTarget) {
    // Камера может ставиться из конструктора — до того, как созданы органы управления.
    const target = this.controls?.target ?? new THREE.Vector3();
    this.camera.position.setFromSpherical(new THREE.Spherical(v.distance, v.polar, v.azimuth)).add(target);
    this.camera.lookAt(target);
    this.controls?.update();
  }

  private materialFor(key: FaceKey): THREE.MeshStandardMaterial | null {
    if (key === "front") return this.frontMats[4];
    if (key === "back") return this.backMats[5];
    if (key === "spine") return this.spineMat;
    const [, index, side] = key.split(":");
    const leaf = this.leaves[Number(index)];
    return leaf ? (side === "f" ? leaf.frontMat : leaf.backMat) : null;
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.running) return;
    let busy = false;

    if (this.tween) {
      const t = this.tween;
      const k = clamp((now - t.t0) / t.dur, 0, 1);
      const e = easeInOut(k);
      this.placeCamera({
        azimuth: t.from.azimuth + (t.to.azimuth - t.from.azimuth) * e,
        polar: t.from.polar + (t.to.polar - t.from.polar) * e,
        distance: t.from.distance + (t.to.distance - t.from.distance) * e,
      });
      if (k >= 1) this.tween = null;
      busy = true;
    }
    if (this.flip) {
      const f = this.flip;
      const k = clamp((now - f.t0) / f.dur, 0, 1);
      this.pos = f.from + (f.to - f.from) * easeInOut(k);
      if (k >= 1) this.flip = null;
      this.apply();
      busy = true;
    }
    // Закрытая книга медленно поворачивается сама; открытую не трогаем — её читают.
    this.controls.autoRotate = this.autoWanted && !this.reduced && this.pos < 0.001;
    const moved = this.controls.update();
    this.fadeGround();
    this.renderer.render(this.scene, this.camera);
    if (busy || moved || this.controls.autoRotate) this.requestRender();
  };

  /** Раскладывает книгу по текущей позиции: обложка, листы, стопки, сдвиг к центру. */
  private apply() {
    const { w: W, block } = this.dims;
    const M = this.leavesCount;
    const p = clamp(this.pos, 0, M + 1);
    const open = clamp(p, 0, 1);
    // Раскрытая книга уходит влево вместе с корешком — центр вращения камеры остаётся посередине разворота.
    this.world.position.x = open * (W / 2);
    const span = this.aperture * Math.PI;
    this.coverPivot.rotation.y = -open * span;
    this.leftHinge.rotation.y = -span;
    this.spineHinge.rotation.y = -spineFold(open, this.aperture);

    const thickness = block.d / M;
    const piles = windowPiles(p, M, block.d, WINDOW);
    const place = (mesh: THREE.Mesh, count: number, top: number, x: number) => {
      mesh.visible = count > 0;
      if (!count) return;
      const h = top + block.d / 2;
      mesh.scale.z = Math.max(h, 0.001);
      mesh.position.set(x, 0, -block.d / 2 + h / 2);
    };
    place(this.pileRight, piles.right.count, piles.right.top, -W / 2 + block.w / 2);
    // Левая стопка строится как правая, но зеркально по глубине (она лежит на перевёрнутой крышке) и вместе с шарниром
    // поворачивается на угол раскрытия — поэтому при любом угле она стыкуется с листами и крышкой.
    this.pileLeft.visible = piles.left.count > 0;
    if (piles.left.count) {
      const h = piles.left.top + block.d / 2;
      this.pileLeft.scale.z = Math.max(h, 0.001);
      this.pileLeft.position.set(block.w / 2, 0, block.d / 2 - h / 2);
    }

    for (let i = 1; i <= M; i++) {
      const leaf = this.leaves[i];
      const shown = p > 0.001 && i >= piles.first && i <= piles.last;
      leaf.front.visible = leaf.back.visible = shown;
      if (!shown) continue;
      const t = clamp(p - i, 0, 1);
      if (leaf.drawn !== t) {
        leaf.drawn = t;
        this.bend(leaf, t, leafZ(i, M, block.d), thickness);
      }
    }
    this.onPosition?.(p);
  }

  /** Пересчитывает форму листа: кривая изгиба в плоскости «ширина × глубина», вытянутая по высоте. */
  private bend(leaf: Leaf, t: number, zOffset: number, sheetThickness: number) {
    const { block, w: W } = this.dims;
    const curve = curlCurve(t, block.w, zOffset, CURL_SEGMENTS, CURL_LAG, this.aperture * Math.PI);
    const pos = leaf.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const half = block.h / 2;
    // Листы лежат чуть выше собственной плоскости, чтобы не мерцать (z-fighting) на ровной стопке.
    const lift = sheetThickness * 0.02;
    for (let k = 0; k <= CURL_SEGMENTS; k++) {
      const x = -W / 2 + curve.x[k];
      const z = curve.z[k] + curve.nz[k] * lift;
      const o = k * 6;
      arr[o] = x;
      arr[o + 1] = half;
      arr[o + 2] = z;
      arr[o + 3] = x;
      arr[o + 4] = -half;
      arr[o + 5] = z;
    }
    pos.needsUpdate = true;
    leaf.geometry.computeVertexNormals();
  }

  private leafGeometry() {
    const n = CURL_SEGMENTS;
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array((n + 1) * 2 * 3);
    const uvs = new Float32Array((n + 1) * 2 * 2);
    const index: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      uvs.set([u, 1, u, 0], k * 4);
      if (k < n) {
        const a = 2 * k;
        index.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setIndex(index);
    return g;
  }

  private buildSpineGeometry() {
    const { h: H, d: D } = this.dims;
    const steps = 18;
    // Корешок слегка выпуклый, как у настоящей книги в твёрдом переплёте.
    const bulge = Math.min(1.6, D * 0.14);
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      // Локальные координаты: начало — заднее ребро корешка; +z идёт к лицу книги.
      const z = D - t * D;
      const x = -bulge * (1 - Math.pow(2 * t - 1, 2));
      positions.push(x, H / 2, z, x, -H / 2, z);
      // Смотрим слева: +z (лицо книги) справа — значит, u растёт к лицу.
      uvs.push(1 - t, 1, 1 - t, 0);
      if (j < steps) {
        const a = 2 * j;
        index.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return this.track(g);
  }

  /** Срез страниц: гладкая основа и еле заметные штрихи листов, чтобы вдали не было муара. */
  private stripeTexture(axis: "u" | "v") {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = axis === "u" ? size : 8;
    canvas.height = axis === "v" ? size : 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f4eee2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(120,100,70,.22)";
    for (let i = 0; i < size; i += 16) {
      if (axis === "u") ctx.fillRect(i, 0, 2, 8);
      else ctx.fillRect(0, i, 8, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.maxAnisotropy;
    const count = Math.max(6, Math.round(this.leavesCount / 2));
    if (axis === "u") tex.repeat.set(count, 1);
    else tex.repeat.set(1, count);
    return tex;
  }

  /**
   * Купол студии: тёмный тёплый верх, светлый «горизонт» на уровне книги и мягкие пятна света (боке) в глубине.
   * Зерно в градиенте убирает концентрические кольца — 8-битный градиент без него расслаивается на полосы.
   */
  private domeTexture() {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, STUDIO.zenith);
    g.addColorStop(0.5, STUDIO.horizon);
    g.addColorStop(1, "#dccfb6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Детерминированный «случай»: фон одинаков при каждом открытии.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w;
      const y = h * (0.06 + rnd() * 0.46);
      const r = 14 + rnd() * 44;
      const warm = rnd() < 0.3;
      const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
      const rgb = warm ? "246,214,160" : "255,250,238";
      const a = 0.05 + rnd() * 0.1;
      blob.addColorStop(0, `rgba(${rgb},${a})`);
      blob.addColorStop(0.65, `rgba(${rgb},${a * 0.55})`);
      blob.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = blob;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.addGrain(ctx, w, h, 3, true);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  /**
   * Лёгкий шум по яркости (±amount из 255): ломает полосы градиента, на глаз незаметен.
   * poles — гасить шум у верха и низа картинки: на куполе эти строки стягиваются в точку, и шум превращается в лучи.
   */
  private addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, poles = false) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    let seed = 91;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const y = Math.floor(i / 4 / w);
      const weight = poles ? Math.pow(Math.sin((Math.PI * (y + 0.5)) / h), 1.5) : 1;
      const n = ((seed / 2147483647) * 2 - 1) * amount * weight;
      d[i] = clamp(d[i] + n, 0, 255);
      d[i + 1] = clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  /** «Стол»: пятно света под книгой, к краям темнее — как на студийном снимке; туман растворяет его в горизонте. */
  private floorTexture() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, STUDIO.floorCenter);
    g.addColorStop(0.18, STUDIO.floorCenter);
    g.addColorStop(1, STUDIO.floorEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    this.addGrain(ctx, size, size, 2.5);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  /**
   * Когда камера уходит под «стол», пол и тень на нём исчезают плавно: иначе снизу видна изнанка плоскости и
   * «тень», висящая в воздухе. Книга при этом просто парит в студии.
   */
  private fadeGround() {
    const fade = clamp((this.camera.position.y - (this.groundY - 60)) / 60, 0, 1);
    this.floor.visible = fade > 0.01;
    this.floorMat.opacity = fade;
    this.contact.visible = fade > 0.01;
    this.contactMat.opacity = 0.5 * fade;
  }

  private contactTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(40,28,18,.9)");
    g.addColorStop(0.5, "rgba(40,28,18,.35)");
    g.addColorStop(1, "rgba(40,28,18,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private readonly handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost?.();
  };
  private readonly handleContextRestored = () => {
    this.onContextRestored?.();
    this.requestRender();
  };

  private readonly handleDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  private readonly handleUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    // Клик, а не вращение: палец почти не сдвинулся и не держал долго.
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || e.timeStamp - d.t > 600) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = [this.coverBoard, this.backBoard];
    for (const leaf of this.leaves) if (leaf?.front.visible) targets.push(leaf.front, leaf.back);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const mesh = hit.object;
      const direct = mesh.userData.flip as FlipHit | undefined;
      if (direct) return this.onPick?.(direct);
      const byMaterial = mesh.userData.picks as Record<number, FlipHit> | undefined;
      const idx = hit.face?.materialIndex;
      if (byMaterial && idx !== undefined && byMaterial[idx]) return this.onPick?.(byMaterial[idx]);
      // Попали в кромку или корешок — это не страница; дальше за ней искать нечего.
      return this.onPick?.(null);
    }
    this.onPick?.(null);
  };
}
