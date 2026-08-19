import TeamBadge from './TeamBadge.jsx';

export default function Scoreboard({ room, mode, players }) {
  if (mode === 'solo') {
    const leaderId = room?.leaderId;
    const ranked = (players || [])
      .filter((p) => p.userId !== leaderId)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
      <section className="scoreboard glass rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-gold-300">⚡ ترتيب اللاعبين</h3>
          <span className="text-xs text-slate-400">{ranked.length} لاعب</span>
        </div>
        {ranked.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-500">لسه مفيش لاعيبة في السباق.</p>
        ) : (
          <ol className="space-y-2">
            {ranked.map((p, i) => (
              <li
                key={p.userId}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                  i === 0 ? 'bg-gold-500/10 ring-1 ring-gold-500/30' : 'bg-night-800/50'
                }`}
              >
                <span className="w-6 text-center text-lg">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="text-lg">{p.avatar}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                  {p.username}
                </span>
                <span className="font-black text-gold-300">{p.score ?? 0}</span>
              </li>
            ))}
          </ol>
        )}
        {leaderId && (
          <p className="mt-3 rounded-lg bg-night-800/50 px-3 py-2 text-center text-[11px] text-slate-500">
            🕵️ القائد خارج السباق — مش بياخد نقاط.
          </p>
        )}
      </section>
    );
  }

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
