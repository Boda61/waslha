import { useEffect, useState } from 'react';

export default function Timer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      onExpire?.();
      return undefined;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onExpire]);

  const danger = left <= 15;
  const pct = Math.round((left / (seconds || 1)) * 100);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-full px-3 py-1 font-black tabular-nums ${
          danger ? 'animate-pulse bg-rose-500/20 text-rose-300' : 'bg-brand-500/20 text-brand-300'
        }`}
      >
        {left}
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-night-700">
        <div
          className={`h-full rounded-full transition-all ${danger ? 'bg-rose-400' : 'bg-brand-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
