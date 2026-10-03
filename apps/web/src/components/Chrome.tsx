import type { ReactNode } from 'react';
import { href, navigate } from '../lib/router.ts';
import { commit, day, seasonName } from './format.ts';
import { season, useLoad } from './hooks.ts';

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href(to)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(to); }} {...rest}>{children}</a>;
}
const NAV: [string, string][] = [['/', 'Home'], ['/arena', 'Arena'], ['/leaderboard', 'Leaderboard'], ['/methodology', 'Methodology'], ['/play', 'Play']];
export function Header({ current, status }: { current: string; status?: string }) {
  return (
    <header className="site">
      <Link to="/" className="mark"><img src={href('/logo.svg')} alt="" />ArcadeBench</Link>
      <nav className="main" aria-label="Main">{NAV.map(([to, label]) => <Link key={to} to={to} aria-current={current === to ? 'page' : undefined}>{label}</Link>)}</nav>
      {status && <span className="status num">{status}</span>}
    </header>
  );
}
export function Footer() {
  const { data: s } = useLoad(season, []);
  return (
    <footer className="site">
      <span>ArcadeBench · open source · methodology v0.1</span>
      {s && <span className="num">{seasonName(s.id)} seed commitment {commit(s.commitment)}{s.revealed ? ', revealed' : `, revealed ${day(s.closes)}`}</span>}
      <span><Link to="/leaderboard">Leaderboard</Link> · <Link to="/methodology">Methodology</Link> · <Link to="/connect">Connect your AI</Link></span>
      <span className="privacy">Privacy: anonymous page counts, no cookies, Do Not Track respected. <Link to="/methodology#privacy">Details</Link></span>
    </footer>
  );
}
