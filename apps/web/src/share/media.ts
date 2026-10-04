import { composite, fonts, sheet, type Frame } from './clip.ts';

const VIDEO = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function save(href: string, name: string) {
  const a = document.createElement('a');
  a.download = name;
  a.href = href;
  a.click();
}
export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  save(u, name);
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

export async function savePng(c: Frame, name: string) {
  await fonts();
  const s = sheet(2);
  composite(s.getContext('2d')!, c);
  save(s.toDataURL('image/png'), `${name}.png`);
}

export interface Made { blob: Blob; file: string }

export async function gif(clips: Frame[], name: string, progress: (p: number) => void): Promise<Made> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  await fonts();
  const grid = clips.some((c) => 'cells' in c), s = sheet(grid ? 1.6 : 1), sg = s.getContext('2d')!, w = grid ? 960 : 640, h = Math.round(s.height * w / s.width);
  const off = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = off.getContext('2d', { willReadFrequently: true })!;
  const enc = GIFEncoder(), delay = Math.round(clamp(12000 / clips.length, 70, 400));
  for (const [i, c] of clips.entries()) {
    composite(sg, c);
    g.drawImage(s, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h), palette = quantize(data, grid ? 128 : 64);
    enc.writeFrame(applyPalette(data, palette), w, h, { palette, delay: i === clips.length - 1 ? 2500 : delay });
    progress((i + 1) / clips.length);
    if (i % 8 === 0) await wait(0);
  }
  enc.finish();
  return { blob: new Blob([enc.bytes()], { type: 'image/gif' }), file: `${name}.gif` };
}

async function encoded(clips: Frame[], name: string, progress: (p: number) => void): Promise<Made | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const mb = await import('mediabunny');
  await fonts();
  const s = sheet(1.6), g = s.getContext('2d')!;
  if (!(await mb.canEncodeVideo('avc', { width: s.width, height: s.height }))) return null;
  const out = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const src = new mb.CanvasSource(s, { codec: 'avc', bitrate: mb.QUALITY_HIGH });
  out.addVideoTrack(src, { frameRate: 30 });
  await out.start();
  const d = clamp(20 / clips.length, 1 / 30, 0.5);
  let t = 0;
  for (const [i, c] of clips.entries()) {
    composite(g, c);
    const dur = i === clips.length - 1 ? 2.5 : d;
    await src.add(t, dur);
    t += dur;
    progress((i + 1) / clips.length);
  }
  await out.finalize();
  return { blob: new Blob([out.target.buffer!], { type: 'video/mp4' }), file: `${name}.mp4` };
}

async function recorded(clips: Frame[], name: string, progress: (p: number) => void): Promise<Made> {
  const type = VIDEO.find((t) => window.MediaRecorder?.isTypeSupported(t));
  if (!type) throw new Error('Video export is not supported in this browser');
  await fonts();
  const s = sheet(1.6), g = s.getContext('2d')!, hold = clamp(20000 / clips.length, 34, 500);
  composite(g, clips[0]);
  const rec = new MediaRecorder(s.captureStream(30), { mimeType: type, videoBitsPerSecond: 12e6 }), chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start();
  for (const [i, c] of clips.entries()) { composite(g, c); progress((i + 1) / clips.length); await wait(hold); }
  await wait(2000);
  rec.stop();
  await stopped;
  return { blob: new Blob(chunks, { type }), file: `${name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}` };
}

export const video = async (clips: Frame[], name: string, progress: (p: number) => void): Promise<Made> =>
  (await encoded(clips, name, progress).catch(() => null)) ?? recorded(clips, name, progress);

const phone = () => matchMedia('(pointer: coarse)').matches;

export async function shareX(m: Made, text: string): Promise<'sheet' | 'manual'> {
  const files = [new File([m.blob], m.file, { type: m.blob.type })];
  if (phone() && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); return 'sheet'; }
    catch (e) { if (e instanceof DOMException && e.name === 'AbortError') throw e; saveBlob(m.blob, m.file); return 'manual'; }
  }
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  saveBlob(m.blob, m.file);
  await navigator.clipboard?.writeText(text).catch(() => {});
  return 'manual';
}
