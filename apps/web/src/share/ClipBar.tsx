import { useState } from 'react';
import { useFlash } from '../components/hooks.ts';
import { track } from '../lib/track.ts';
import { gif, savePng, saveBlob, shareX, video, type Made } from './media.ts';
import { frames, type Source } from './whole.ts';

type Kind = 'gif' | 'video' | 'x' | 'png';
const MAX = { gif: 150, video: 600 };

export default function ClipBar({ src, name, text }: { src: () => Source | Promise<Source>; name: string; text: string }) {
  const [busy, setBusy] = useState<[Kind, number] | null>(null), [msg, flash] = useFlash();
  const build = async (kind: Kind, as: 'gif' | 'video'): Promise<Made> => (as === 'gif' ? gif : video)(frames(await src(), MAX[as]), name, (p) => setBusy([kind, Math.round(p * 100)]));
  const act = (kind: Kind, f: () => Promise<string>) => async () => {
    setBusy([kind, 0]);
    try { flash(await f()); } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) flash(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(null); }
  };
  const save = (as: 'gif' | 'video') => act(as, async () => { const m = await build(as, as); saveBlob(m.blob, m.file); track(`export_${as}`); return `${as === 'gif' ? 'GIF' : 'Video'} saved`; });
  const x = act('x', async () => {
    const how = await shareX(await build('x', 'video'), text);
    track('share_x');
    return how === 'sheet' ? 'Shared' : 'Clip downloaded and post text copied: drop the clip into the X post';
  });
  const png = act('png', async () => { const c = frames(await src(), 1); await savePng(c[c.length - 1], name); track('export_png'); return 'Image downloaded'; });
  const label = (kind: Kind, idle: string) => (busy?.[0] === kind ? `Creating… ${busy[1]}%` : idle);
  return (
    <div className="share" role="group" aria-label="Create and share">
      <button type="button" className="rec" disabled={!!busy} onClick={x}>{label('x', 'Share clip to X')}</button>
      <button type="button" disabled={!!busy} onClick={save('video')}>{label('video', 'Download video')}</button>
      <button type="button" disabled={!!busy} onClick={save('gif')}>{label('gif', 'Download GIF')}</button>
      <button type="button" disabled={!!busy} onClick={png}>Download image</button>
      <span className="flash" role="status">{msg}</span>
    </div>
  );
}
