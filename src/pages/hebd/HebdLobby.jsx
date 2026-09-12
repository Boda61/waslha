import RoomCode from '../../components/RoomCode.jsx';
import Avatar from '../../components/Avatar.jsx';

// Hebd lobby — two player slots (host + guest), live via realtime.
export default function HebdLobby({
  room,
  players,
  myUserId,
  isHost,
  busy,
  onSetReady,
  onStart,
  onLeave,
}) {
  const hostPlayer = players.find((p) => p.userId === room?.hostId);
  const guestPlayer = players.find((p) => p.userId !== room?.hostId);
  const myPlayer = players.find((p) => p.userId === myUserId);

  const bothReady = players.length === 2 && players.every((p) => p.isReady);
  const canStart = isHost && bothReady && busy !== 'start';

  const playerSlot = (player, tag) => {
    if (!player) return null;
    const isMe = player.userId === myUserId;
    const isHostPlayer = player.userId === room?.hostId;
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition ${
          isMe ? 'border-brand-500/50 bg-white/5' : 'border-white/10 bg-white/5'
        }`}
      >
        <Avatar avatar={player.avatar} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-white">
            {player.username}
            {isMe && <span className="mr-1 text-sm text-brand-300">(انت)</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-lg bg-night-700 px-2 py-0.5 font-bold text-slate-300">
              {tag}
            </span>
            {isHostPlayer && (
              <span className="rounded-lg bg-gold-500/20 px-2 py-0.5 font-bold text-gold-300">
                👑 صاحب اللعبة
              </span>
            )}
            {player.isReady ? (
              <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                جاهز ✓
              </span>
            ) : (
              <span className="rounded-lg bg-night-700 px-2 py-0.5 font-bold text-slate-500">
                لسه بيجهز...
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="lobby-shell mx-auto max-w-xl px-4 py-8">
      {/* Header + code */}
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-black text-white">🎮 هبد في هبد</h1>
        <RoomCode code={room?.code} />
      </div>

      {/* Players */}
      <div className="mt-8 space-y-3">
        <p className="text-sm font-bold text-slate-400">اللاعب الأول</p>
        {hostPlayer ? playerSlot(hostPlayer, 'اللاعب الأول') : null}

        <p className="pt-2 text-sm font-bold text-slate-400">اللاعب الثاني</p>
        {guestPlayer ? (
          playerSlot(guestPlayer, 'اللاعب الثاني')
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
            <span className="text-3xl">🪑</span>
            <p className="text-sm text-slate-400">في انتظار اللاعب الثاني...</p>
            <p className="text-xs text-slate-600">
              ابعتلوا الكود ده عشان يقدر يدخل معاك
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="glass mt-8 flex flex-col items-center gap-3 rounded-2xl p-5">
        <button
          onClick={onSetReady}
          disabled={busy === 'ready' || !myPlayer}
          className={`w-full rounded-xl px-6 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            myPlayer?.isReady
              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40'
              : 'bg-brand-500 text-night-950 hover:bg-brand-400'
          }`}
        >
          {myPlayer?.isReady ? 'مش جاهز تاني' : 'أنا جاهز ✓'}
        </button>

        {isHost && (
          <button
            onClick={onStart}
            disabled={!canStart}
            className="w-full rounded-xl bg-gold-500 px-6 py-3 font-black text-night-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {players.length < 2
              ? 'في انتظار اللاعب الثاني...'
              : bothReady
                ? 'ابدأ اللعبة 🚀'
                : 'الاتنين لازم يبقوا جاهزين'}
          </button>
        )}

        <button
          onClick={onLeave}
          disabled={busy === 'leave'}
          className="w-full rounded-xl border border-rose-500/40 px-6 py-3 font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'leave' ? 'بنسيب الغرفة...' : 'خروج من الغرفة'}
        </button>
      </div>
    </div>
  );
}