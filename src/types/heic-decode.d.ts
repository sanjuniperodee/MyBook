declare module "heic-decode" {
  /** Раскодирует HEIC в RGBA (повёрнут по ориентации снимка). */
  export default function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}
