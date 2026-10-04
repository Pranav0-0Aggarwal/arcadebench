import { useState, type ReactNode } from 'react';
import { BASE_PATH, SITE_ORIGIN } from '@arcadebench/api';
import { Link } from '../components/Chrome.tsx';
import { useFlash } from '../components/hooks.ts';
import { track } from '../lib/track.ts';
import { recordGif, recordVideo, savePng } from '../share/scene.ts';
import { SCENES, type SceneId } from './scenes.ts';
import { useScene } from './useScene.ts';

export interface VizProps { id: SceneId; game: string; title: string; blurb: string; label: string; credit: ReactNode; paused: boolean; hero?: boolean }
type Rec = (c: HTMLCanvasElement, name: string, onLeft: (s: number) => void) => Promise<void>;

export default function Viz({ id, game, title, blurb, label, credit, paused, hero }: VizProps) {
  const { ref, capture } = useScene(SCENES[id], paused), [busy, setBusy] = useState<[string, number] | null>(null), [msg, flash, copy] = useFlash();
  const H = hero ? 'h2' : 'h3';
  const record = (kind: string, event: string, rec: Rec) => async () => {
    setBusy([kind, 0]);
    try { await capture((c) => rec(c, `arcadebench-${id}`, (s) => setBusy([kind, s]))); track(event); } catch (e) { flash(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(null); }
  };
  const label2 = (kind: string, idle: string) => (busy?.[0] === kind ? (busy[1] ? `Recording… ${busy[1]}s` : 'Preparing…') : idle);
  return (
    <section className={`viz${hero ? ' hero-viz' : ''}`} id={id} aria-labelledby={`${id}-h`}>
      <div className="viz-head">
        <div><H id={`${id}-h`}>{title}</H><p>{blurb}</p><p className="viz-go"><Link to={`/play/${game}`}>Play it yourself</Link><Link to={`/arena?game=${game}`}>Watch models live</Link></p></div>
        <div className="share" role="group" aria-label={`Export ${title}`}>
          <button type="button" className="rec" disabled={!!busy} onClick={record('video', 'export_video', recordVideo)}>{label2('video', 'Record video')}</button>
          <button type="button" disabled={!!busy} onClick={record('gif', 'export_gif', recordGif)}>{label2('gif', 'Record GIF')}</button>
          <button type="button" disabled={!!busy} onClick={() => { savePng(ref.current!, `arcadebench-${id}`); track('export_png'); flash('Image downloaded'); }}>Download image</button>
          <button type="button" onClick={() => { copy(`${SITE_ORIGIN}${BASE_PATH}/#${id}`, 'Link copied'); track('copy_link'); }}>Copy link</button>
          <span className="flash" role="status">{msg}</span>
        </div>
      </div>
      <canvas ref={ref} role="img" aria-label={label} />
      <p className="source">Illustration of the task: the models are simulated. Real scores are on the <Link to="/leaderboard">leaderboard</Link>. {credit}</p>
    </section>
  );
}
