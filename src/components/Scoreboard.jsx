import TeamBadge from './TeamBadge.jsx';

export default function Scoreboard({ room }) {
  const red = room?.redScore ?? 0;
  const blue = room?.blueScore ?? 0;
  const total = red + blue || 1;

  const bar = (score, color) => {
    const pct = Math.round((score / total) * 100);
    return (
      <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    );
  };

  return (
    <section className="scoreboard glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-center">
        <div className="flex-1">
          <TeamBadge teamId="red" />
          <p className="mt-1 text-3xl font-black text-rose-300">{red}</p>
        </div>
        <div className="px-3 text-2xl font-black text-gold-400">⚔️</div>
        <div className="flex-1">
          <TeamBadge teamId="blue" />
          <p className="mt-1 text-3xl font-black text-sky-300">{blue}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-1 overflow-hidden rounded-full bg-night-800">
        <div className="flex-[1] bg-rose-500/20" />
        <div className="flex-[1] bg-sky-500/20" />
      </div>
      <div className="mt-1 flex gap-1">
        {bar(red, 'bg-rose-400')}
        {bar(blue, 'bg-sky-400')}
      </div>
    </section>
  );
}
