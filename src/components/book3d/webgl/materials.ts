import * as THREE from "three";

type Track = <T extends { dispose(): void }>(item: T) => T;

/**
 * Материалы книги: кромка крышек, ткань обложки, форзац, корешок, срез и бумага стопок, листы. Каждый
 * отдаётся через track — сцена освобождает их при закрытии. Порядок граней BoxGeometry: +x, −x, +y, −y, +z, −z.
 */
export function bookMaterials(track: Track, edgeColor: string, stripes: { u: THREE.Texture; v: THREE.Texture }) {
  const edge = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(edgeColor), roughness: 0.82, metalness: 0 }));
  const endpaper = track(new THREE.MeshStandardMaterial({ color: "#eee6d3", roughness: 0.95, metalness: 0 }));
  const cloth = () => track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, metalness: 0 }));
  const spine = track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0, side: THREE.DoubleSide }));
  const front = [edge, edge, edge, edge, cloth(), endpaper];
  const back = [edge, edge, edge, edge, endpaper, cloth()];
  const paper = track(new THREE.MeshStandardMaterial({ color: "#f6f1e6", roughness: 0.95, metalness: 0 }));
  const sideU = track(new THREE.MeshStandardMaterial({ map: stripes.u, roughness: 0.95, metalness: 0 }));
  const sideV = track(new THREE.MeshStandardMaterial({ map: stripes.v, roughness: 0.95, metalness: 0 }));
  const pile = [sideU, sideU, sideV, sideV, paper, paper];
  /**
   * Сторона листа: лицевая (FrontSide) или оборот (BackSide) — свой материал, на него ложится картинка полосы.
   * Цвета вершин листа — тень у корешка (leafGeometry): сцена считает свет, но не складку.
   */
  const page = (side: THREE.Side) => track(new THREE.MeshStandardMaterial({ color: "#fbf8f1", roughness: 0.92, metalness: 0, side, vertexColors: true }));
  return { edge, spine, front, back, pile, page };
}
