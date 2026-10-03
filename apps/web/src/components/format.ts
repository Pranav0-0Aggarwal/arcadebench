export const f2 = (v: number) => v.toFixed(2);
export const seasonName = (id: string) => (/^s?\d+$/i.test(id) ? `Season ${id.replace(/\D/g, '').padStart(2, '0')}` : id);
export const commit = (h: string) => { const x = h.replace(/^sha256:/, ''); return `sha256:${x.slice(0, 4)}…${x.slice(-4)}`; };
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
