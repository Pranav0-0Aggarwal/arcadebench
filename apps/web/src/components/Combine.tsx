import { useState, type FormEvent } from 'react';
import { navigate } from '../lib/router.ts';
import { gridPath } from './Live.tsx';

const ids = (text: string) => text.split(/\s+/).flatMap((t) => t.replace(/[?#].*/, '').replace(/^.*\/watch\//, '').split(',')).filter((x) => /^[\w-]+$/.test(x));

export default function Combine({ have, label }: { have: string[]; label: string }) {
  const [text, set] = useState(''), [none, setNone] = useState(false);
  const add = [...new Set(ids(text))].filter((x) => !have.includes(x));
  const go = (e: FormEvent) => { e.preventDefault(); if (add.length) navigate(gridPath([...have, ...add].slice(0, 4))); else setNone(true); };
  return (
    <form className="arena-bar combine" onSubmit={go}>
      <div className="field seed"><label htmlFor="cmb">{label}</label><div className="in"><input id="cmb" value={text} placeholder="Paste watch links or ids" onChange={(e) => { set(e.target.value); setNone(false); }} /></div></div>
      <button type="submit" className="btn" disabled={!text.trim()}>{have.length > 1 ? 'Add' : 'Combine'}</button>
      {none && <span className="err" role="alert">No new watch link found.</span>}
    </form>
  );
}
