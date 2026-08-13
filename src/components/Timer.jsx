import { useEffect, useState } from 'react';

/**
 * Authoritative countdown timer.
 *
 * It never restarts on mount — the remaining time is derived from a persisted
 * server-side `deadline` (ISO string or epoch ms). Every player computes the
 * same remaining time from the same deadline (within normal clock skew), and
 * a browser refresh keeps the same remaining seconds because the deadline
 * lives in the database, not in React state.
 */
export default function Timer({ deadline, durationSeconds = 90, onExpire }) {
  const [deadlineMs, setDeadlineMs] = useState(() => {
    if (!deadline) return 0;
    const ms = new Date(deadline).getTime();
    return Number.isFinite(ms) ? ms : 0;
  });
  const [now, setNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);

  // Keep the latest persisted deadline (e.g. when a new round arrives).
  useEffect(() => {
    if (!deadline) return;
    const ms = new Date(deadline).getTime();
    if (Number.isFinite(ms)) {
      setDeadlineMs(ms);
      setExpired(false);
      setNow(Date.now());
    }
  }, [deadline]);

  // Tick frequently so the bar is smooth; the displayed number stays stable.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = deadlineMs ? deadlineMs - now : 0;
  const left = Math.max(0, Math.ceil(remainingMs / 1000));
  const total = Math.max(1, durationSeconds);
  const pct = Math.min(100, Math.max(0, Math.round((remainingMs / (total * 1000)) * 100)));
  const danger = left <= 15;

  // Fire once when the deadline is reached.
  useEffect(() => {
    if (deadlineMs && !expired && left <= 0) {
      setExpired(true);
      onExpire?.();
    }
  }, [left, expired, deadlineMs, onExpire]);

  return (
    <div className="flex items-center gap-2" aria-live="polite">
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