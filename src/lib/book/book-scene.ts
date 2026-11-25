/**
 * Объёмная книга в студии — числа сцены, общие у 3D-книги сайта (components/book3d/webgl, three.js) и приложения
 * «MyBooks» (API v1 bookModel.scene): камера, ракурсы, чтение, раскрытие, изгиб листа, свет, цвета материалов и студии,
 * ход листания. Поменяли здесь — поменялось и на сайте, и в приложении. Без three.js и DOM.
 */
import { APERTURE, BOARD_MM } from "./book-model";
import { CURL_LAG, CURL_SEGMENTS } from "./page-curl";

/** Камера: лёгкий «телеобъектив» (вертикальный угол, градусы); расстояние — высота книги / (k · tan(fov/2)). */
export const SCENE_CAMERA = { fovDeg: 24, distanceK: 1.3, zoomMin: 0.4, zoomMax: 1.9, polarMin: 0.02 } as const;

/** Ракурсы (сферические углы камеры, радианы): азимут 0 — спереди, отрицательный — слева (виден корешок). */
export const SCENE_VIEWS = {
  front: { azimuth: 0, polar: Math.PI / 2 },
  spine: { azimuth: -Math.PI / 2, polar: Math.PI / 2 },
  back: { azimuth: Math.PI, polar: Math.PI / 2 },
  edge: { azimuth: Math.PI / 2, polar: Math.PI / 2 },
  top: { azimuth: 0, polar: 0.02 },
  bottom: { azimuth: 0, polar: Math.PI - 0.02 },
} as const;
export const SCENE_INITIAL = { azimuth: -0.49, polar: 1.33 } as const;
/** Чтение: лицом к читателю, чуть сверху, чуть крупнее. Открывая книгу сбоку, сверху или снизу, разворачиваем сюда. */
export const SCENE_READ = { azimuth: 0, polar: 1.36, zoom: 1.04, turnIfAzimuthOver: 0.14, turnIfPolarOver: 1.5, turnIfPolarUnder: 0.8, turnMs: 750 } as const;

/** Вращение: скорость пальца, затухание (доля за кадр 60 Гц), автоповорот (OrbitControls.autoRotateSpeed: 1 — оборот за 60 с). */
export const SCENE_ORBIT = { rotateSpeed: 0.85, damping: 0.09, autoRotateSpeed: 1.1, zoomMs: 450, viewMs: 750 } as const;

/** Листание: длительность перехода к позиции через n листов, мс — min(max, base + perLeaf · (n − 1)). */
export const SCENE_FLIP = { baseMs: 700, perLeafMs: 110, maxMs: 1500 } as const;

/** Свет (как в BookScene): направления — в долях ширины W и высоты H книги; интенсивности; окружение и экспозиция. */
export const SCENE_LIGHTS = {
  key: { at: [-0.7, 3.3, 1.3], color: "#fff4e6", intensity: 1.2 },
  back: { at: [1.8, 1.2, -2.2], color: "#f3efe8", intensity: 0.75 },
  bounce: { at: [-0.4, -2, 1.2], color: "#f6ecda", intensity: 0.5 },
  hemi: { sky: "#fff8ee", ground: "#e3d9c6", intensity: 0.28 },
  environment: 0.42,
  exposure: 1.07,
  /**
   * Приложение: диффузный свет окружения RoomEnvironment одним числом (на сайте его считает PMREM). Подобрано так, чтобы
   * освещённая обложка давала те же ~94% цвета ткани, что на сайте.
   */
  environmentIrradiance: 4.75,
  shadowRadius: 9,
  contactOpacity: 0.5,
} as const;

/** Студия: купол (зенит → горизонт → низ), пол (центр → край), туман (в долях расстояния камеры). */
export const SCENE_STUDIO = {
  zenith: "#cfbe9f",
  horizon: "#e8dbc3",
  nadir: "#dccfb6",
  floorCenter: "#f6eddc",
  floorEdge: "#d9c9ad",
  floorRadiusK: 8,
  fogNearK: 2.4,
  fogFarK: 7.5,
  contact: "rgba(40,28,18,.9)",
} as const;

/** Материалы: кромка картона, форзац, бумага стопок, лист. */
export const SCENE_MATERIALS = { edge: "#b9ab93", endpaper: "#eee6d3", paper: "#f6f1e6", page: "#fbf8f1" } as const;

/** Тень у корешка на странице: затемнение от сгиба (u = 0), к 18% ширины сходит на нет. */
export const SCENE_GUTTER = { a0: 0.22, u1: 0.07, a1: 0.05, u2: 0.18 } as const;

export function gutterShadeAt(u: number) {
  const g = SCENE_GUTTER;
  const a = u < g.u1 ? g.a0 - ((g.a0 - g.a1) * u) / g.u1 : u < g.u2 ? g.a1 * (1 - (u - g.u1) / (g.u2 - g.u1)) : 0;
  return Math.pow(1 - a, 2.2);
}

/** Выпуклость корешка, мм, у книги толщиной D. */
export const spineBulge = (D: number) => Math.min(1.6, D * 0.14);

/** Всё для приложения одним объектом (API v1 bookModel.scene). */
export function sceneForApp(dims: { w: number; h: number; d: number }) {
  const dir = (at: readonly number[]) => {
    const v = [at[0] * dims.w, at[1] * dims.h, at[2] * dims.w];
    const len = Math.hypot(v[0], v[1], v[2]);
    return { x: v[0] / len, y: v[1] / len, z: v[2] / len };
  };
  const L = SCENE_LIGHTS;
  const light = (l: { at: readonly number[]; color: string; intensity: number }) => ({ ...dir(l.at), color: l.color, intensity: l.intensity });
  return {
    camera: { ...SCENE_CAMERA },
    initial: { ...SCENE_INITIAL },
    read: { ...SCENE_READ },
    views: Object.entries(SCENE_VIEWS).map(([id, v]) => ({ id, ...v })),
    orbit: { ...SCENE_ORBIT },
    flip: { ...SCENE_FLIP },
    aperture: APERTURE.default,
    boardMm: BOARD_MM,
    spineBulge: spineBulge(dims.d),
    curl: { lag: CURL_LAG, segments: CURL_SEGMENTS },
    lights: {
      key: light(L.key),
      back: light(L.back),
      bounce: light(L.bounce),
      hemi: { ...L.hemi },
      environment: L.environment,
      environmentIrradiance: L.environmentIrradiance,
      exposure: L.exposure,
      shadowRadius: L.shadowRadius,
      contactOpacity: L.contactOpacity,
    },
    studio: { ...SCENE_STUDIO },
    materials: { ...SCENE_MATERIALS },
    gutter: { ...SCENE_GUTTER },
  };
}
