const VIDEO = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
const GIFENC: string = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function save(href: string, name: string) {
  const a = document.createElement('a');
  a.download = name;
  a.href = href;
  a.click();
}
function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  save(u, name);
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

export const savePng = (c: HTMLCanvasElement, name: string) => save(c.toDataURL('image/png'), `${name}.png`);

export async function recordVideo(c: HTMLCanvasElement, name: string, onLeft: (s: number) => void, ms = 8000) {
  const type = VIDEO.find((t) => window.MediaRecorder?.isTypeSupported(t));
  if (!type) throw new Error('Video recording is not supported in this browser');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 }), chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start();
  const t0 = performance.now(), id = setInterval(() => onLeft(Math.ceil((ms - (performance.now() - t0)) / 1000)), 250);
  onLeft(Math.ceil(ms / 1000));
  await wait(ms);
  clearInterval(id);
  rec.stop();
  await stopped;
  saveBlob(new Blob(chunks, { type }), `${name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
}

export async function recordGif(c: HTMLCanvasElement, name: string, onLeft: (s: number) => void, secs = 6, fps = 12) {
  const { GIFEncoder, quantize, applyPalette } = await import(/* @vite-ignore */ GIFENC);
  const r = c.getBoundingClientRect(), k = Math.min(1, 640 / r.width), w = Math.round(r.width * k), h = Math.round(r.height * k);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const g = off.getContext('2d', { willReadFrequently: true })!, enc = GIFEncoder(), n = fps * secs;
  for (let i = 0; i < n; i++) {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(c, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h), palette = quantize(data, 64);
    enc.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) });
    onLeft(Math.ceil((n - i) / fps));
    await wait(1000 / fps);
  }
  enc.finish();
  saveBlob(new Blob([enc.bytes()], { type: 'image/gif' }), `${name}.gif`);
}
