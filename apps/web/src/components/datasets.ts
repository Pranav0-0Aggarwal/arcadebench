export interface Dataset { id: string; name: string; task: string; licence: string; url?: string }

export const DATASETS: Dataset[] = [
  { id: 'sms', name: 'SMS Spam Collection', task: 'Spam or ham', licence: 'CC BY 4.0', url: 'https://archive.ics.uci.edu/dataset/228/sms+spam+collection' },
  { id: 'fraud', name: 'PaySim', task: 'Is this transaction fraudulent? Rendered as readable text', licence: 'CC BY-SA 4.0', url: 'https://www.kaggle.com/datasets/ealaxi/paysim1' },
  { id: 'bfcl', name: 'Berkeley Function Calling Leaderboard v3', task: 'Pick the right function (multiple and live_multiple)', licence: 'Apache-2.0', url: 'https://gorilla.cs.berkeley.edu/leaderboard.html' },
  { id: 'inbox', name: 'ArcadeBench SMS Inbox', task: 'Message type, then spending category for expenses; generated and real messages', licence: 'CC BY 4.0 (generated), UCI SMS Spam Collection CC BY 4.0' },
  { id: 'banking77', name: 'BANKING77', task: '77-way bank intent, ten options per item', licence: 'CC BY 4.0', url: 'https://huggingface.co/datasets/PolyAI/banking77' },
  { id: 'clinc', name: 'CLINC150', task: 'Intent, including out-of-scope', licence: 'CC BY 3.0', url: 'https://github.com/clinc/oos-eval' },
  { id: 'deskpet', name: 'ArcadeBench desk-pet suite', task: 'Tool choice, routing, urgency, confirmation, scam SMS', licence: 'Original, synthetic' },
];
export const dataset = (id: string) => DATASETS.find((d) => d.id === id)!;
