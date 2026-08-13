import { teamTheme } from '../utils/helpers.js';

export default function TeamBadge({ teamId, size = 'md' }) {
  const theme = teamTheme(teamId);
  const colorClass =
    theme.color === 'rose'
      ? 'bg-rose-500/15 text-rose-300 ring-rose-400/30'
      : theme.color === 'sky'
        ? 'bg-sky-500/15 text-sky-300 ring-sky-400/30'
        : 'bg-night-700 text-slate-300 ring-white/10';
  const pad = size === 'lg' ? 'px-4 py-1.5 text-lg' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ring-1 ${colorClass} ${pad}`}>
      <span>{theme.emoji}</span>
      {theme.name}
    </span>
  );
}
