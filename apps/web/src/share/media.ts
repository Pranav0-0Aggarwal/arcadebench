import { composite, fonts, sheet, type Clip } from './clip.ts';

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

export async function savePng(c: Clip, name: string) {
  await fonts();
  const s = sheet();
  composite(s.getContext('2d')!, c);
  save(s.toDataURL('image/png'), `${name}.png`);
}

export interface Made { blob: Blob; file: string }

export async function gif(clips: Clip[], name: string, progress: (p: number) => void): Promise<Made> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  await fonts();
  const s = sheet(), sg = s.getContext('2d')!, w = 640, h = Math.round(s.height * w / s.width);
  const off = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = off.getContext('2d', { willReadFrequently: true })!;
  const enc = GIFEncoder(), delay = Math.round(clamp(12000 / clips.length, 70, 400));
  for (const [i, c] of clips.entries()) {
    composite(sg, c);
    g.drawImage(s, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h), palette = quantize(data, 64);
    enc.writeFrame(applyPalette(data, palette), w, h, { palette, delay: i === clips.length - 1 ? 2500 : delay });
    progress((i + 1) / clips.length);
    if (i % 8 === 0) await wait(0);
  }
  enc.finish();
  return { blob: new Blob([enc.bytes()], { type: 'image/gif' }), file: `${name}.gif` };
}

export async function video(clips: Clip[], name: string, progress: (p: number) => void): Promise<Made> {
  const type = VIDEO.find((t) => window.MediaRecorder?.isTypeSupported(t));
  if (!type) throw new Error('Video recording is not supported in this browser');
  await fonts();
  const s = sheet(), g = s.getContext('2d')!, hold = clamp(20000 / clips.length, 34, 500);
  composite(g, clips[0]);
  const rec = new MediaRecorder(s.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 }), chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start();
  for (const [i, c] of clips.entries()) {
    composite(g, c);
    progress((i + 1) / clips.length);
    await wait(hold);
  }
  await wait(2000);
  rec.stop();
  await stopped;
  return { blob: new Blob(chunks, { type }), file: `${name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}` };
}

export async function shareX(m: Made, text: string): Promise<'sheet' | 'manual'> {
  const files = [new File([m.blob], m.file, { type: m.blob.type })];
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, text });
    return 'sheet';
  }
  saveBlob(m.blob, m.file);
  await navigator.clipboard?.writeText(text).catch(() => {});
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'manual';
}
