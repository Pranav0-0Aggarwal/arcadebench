import { useState } from 'react';
import { useFlash } from '../components/hooks.ts';
import { track } from '../lib/track.ts';
import { composite, fonts, sheet, type Clip } from './clip.ts';
import { recordGif, recordVideo, savePng } from './media.ts';

type Rec = (c: HTMLCanvasElement, name: string, onLeft: (s: number) => void) => Promise<void>;

export default function ClipBar({ get, name, text, before }: { get: () => Clip; name: string; text: string; before?: () => void }) {
  const [busy, setBusy] = useState<[string, number] | null>(null), [msg, flash] = useFlash();
  const run = (kind: string, event: string, rec: Rec) => async () => {
    setBusy([kind, 0]);
    const c = sheet(), g = c.getContext('2d')!;
    let raf = 0;
    try {
      await fonts();
      const tick = () => { composite(g, get()); raf = requestAnimationFrame(tick); };
      tick();
      before?.();
      await rec(c, name, (s) => setBusy([kind, s]));
      track(event);
    } catch (e) { flash(e instanceof Error ? e.message : 'Export failed'); } finally { cancelAnimationFrame(raf); setBusy(null); }
  };
  const png = async () => { await fonts(); const c = sheet(); composite(c.getContext('2d')!, get()); savePng(c, name); track('export_png'); flash('Image downloaded'); };
  const label = (kind: string, idle: string) => (busy?.[0] === kind ? (busy[1] ? `Recording… ${busy[1]}s` : 'Preparing…') : idle);
  return (
    <div className="share" role="group" aria-label="Record and share">
      <button type="button" className="rec" disabled={!!busy} onClick={run('video', 'export_video', recordVideo)}>{label('video', 'Record MP4/WebM')}</button>
      <button type="button" disabled={!!busy} onClick={run('gif', 'export_gif', recordGif)}>{label('gif', 'Record GIF')}</button>
      <button type="button" disabled={!!busy} onClick={png}>Download image</button>
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => track('share_x')}>Post to X</a>
      <span className="flash" role="status">{msg}</span>
    </div>
  );
}
