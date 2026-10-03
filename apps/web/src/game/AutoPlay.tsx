export interface AutoPlayProps { game: string; seed: number; policy: 'expert' | 'random'; speed?: number; className?: string }
export default function AutoPlay({ className }: AutoPlayProps) {
  return <canvas className={className} aria-hidden="true" />;
}
