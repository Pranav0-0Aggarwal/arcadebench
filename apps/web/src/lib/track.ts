import { BASE_PATH } from '@arcadebench/api';

const off = () => navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
const sid = () => {
  let s = sessionStorage.getItem('t');
  if (!s) sessionStorage.setItem('t', (s = crypto.randomUUID()));
  return s;
};
const send = (p: string, r = '') => {
  try {
    if (off()) return;
    navigator.sendBeacon('/t/v', new Blob([JSON.stringify({ p, r, s: sid() })], { type: 'application/json' }));
  } catch {}
};
const host = () => { try { return document.referrer ? new URL(document.referrer).host : ''; } catch { return ''; } };

export const view = () => send(location.pathname, host());
export const track = (e: string) => send(`${BASE_PATH}/_e/${e.replace(/[^a-z0-9_:-]/gi, '')}`);
