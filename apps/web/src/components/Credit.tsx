import { dataset } from './datasets.ts';

export const Src = ({ id }: { id: string }) => { const d = dataset(id); return d.url ? <a href={d.url} rel="noopener noreferrer">{d.name}</a> : <>{d.name}</>; };
export const Credit = ({ id, plus }: { id: string; plus?: string }) => <>Dataset: <Src id={id} />, {dataset(id).licence}{plus && <> · plus the <Src id={plus} /></>}</>;
