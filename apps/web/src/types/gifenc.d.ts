declare module 'gifenc' {
  type Palette = number[][];
  export function GIFEncoder(): { writeFrame(index: Uint8Array, w: number, h: number, o: { palette: Palette; delay?: number }): void; finish(): void; bytes(): Uint8Array<ArrayBuffer> };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, colors: number): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
}
