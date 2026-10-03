import { savePng } from '../share/media.ts';
import { useFlash } from './hooks.ts';
import { track } from '../lib/track.ts';

const ICON = {
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1',
  image: 'M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11',
  embed: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
  x: 'M3 3l10 10M13 3L3 13',
};
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export interface ShareProps { url: string; text: string; embed: string; name: string; card: () => Promise<HTMLCanvasElement> }

export default function ShareBar({ url, text, embed, name, card }: ShareProps) {
  const [msg, flash, copy] = useFlash();
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="share noembed" role="group" aria-label="Share these standings">
      <button type="button" onClick={() => { copy(url, 'Link copied'); track('board_link'); }}><Icon d={ICON.link} />Copy link</button>
      <button type="button" onClick={async () => { savePng(await card(), name); flash('Image downloaded'); track('share_png'); }}><Icon d={ICON.image} />Download image</button>
      <button type="button" onClick={() => { copy(embed, 'Embed code copied'); track('embed'); }}><Icon d={ICON.embed} />Embed</button>
      <a href={x} target="_blank" rel="noopener noreferrer" onClick={() => track('share_x')}><Icon d={ICON.x} />Post to X</a>
      <span className="flash" role="status">{msg}</span>
    </div>
  );
}
