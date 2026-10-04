import Block from '../components/Block.tsx';
import { Credit, Src } from '../components/Credit.tsx';
import { dataset } from '../components/datasets.ts';
import Viz, { type VizProps } from './Viz.tsx';


export const SWITCHBOARD: Omit<VizProps, 'paused'> = {
  id: 'tools', game: 'switchboard', title: 'The Switchboard', hero: true, label: 'Animated illustration: three simulated models route each request to a function; right plugs click, wrong ones spark',
  blurb: 'Three models get the same request and plug it into the function they picked. Right plugs click; wrong ones spark.', credit: <Credit id="bfcl" plus="deskpet" />,
};
const SORTER: Omit<VizProps, 'paused'> = {
  id: 'sms', game: 'sorter', title: 'The Mail Sorter', label: 'Animated illustration: three simulated models sort text messages into inbox and spam',
  blurb: "Each message drops down every model's chute; wrong calls crack and land in the oops pile.", credit: <Credit id="sms" />,
};
const CHECKPOINT: Omit<VizProps, 'paused'> = {
  id: 'fraud', game: 'checkpoint', title: 'The Checkpoint', label: 'Animated illustration: three simulated models flag fraudulent transactions at a gate',
  blurb: 'Each model runs a gate: catch the fraud, let honest payments through.', credit: <Credit id="fraud" />,
};

export default function Lab({ paused }: { paused: boolean }) {
  return (
    <Block id="lab" title="Decision Lab: one decision at a time" sub="Open datasets turned into tasks you can play and models can be scored on, with a scene you can watch and record. Each task is 300 items scored against the dataset label.">
      <div className="lab">
        <Viz {...SORTER} paused={paused} />
        <Viz {...CHECKPOINT} paused={paused} />
        <p className="also">Also in the Lab: <Src id="banking77" /> (bank intents, {dataset('banking77').licence}), <Src id="clinc" /> (intents with out-of-scope, {dataset('clinc').licence}) and the <Src id="deskpet" /> (routing, urgency, confirmation, scam SMS; original, synthetic).</p>
      </div>
    </Block>
  );
}
