import { useFlash } from './hooks.ts';

export default function Code({ text }: { text: string }) {
  const [msg, , copy] = useFlash();
  return (
    <div className="code">
      <pre tabIndex={0}><code>{text.split('\n').map((l, i) => <span key={i}>{i > 0 && '\n'}{l.startsWith('#') ? <span className="c">{l}</span> : l}</span>)}</code></pre>
      <button type="button" className="btn ghost copy" onClick={() => copy(text)}>{msg || 'Copy'}</button>
    </div>
  );
}
