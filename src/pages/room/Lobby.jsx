import { useState } from 'react';
import RoomCode from '../../components/RoomCode.jsx';
import PlayerCard from '../../components/PlayerCard.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../utils/constants.js';

const TEAM_IDS = ['red', 'blue'];

export default function Lobby({
  room,
  players,
  myPlayer,
  isHost,
  isLeader,
  onSetTeam,
  onSetReady,
  onMakeLeader,
  onTransferHost,
  onStartGame,
  onLeave,
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState('');

  const assignTeam = async (team) => {
    if (!myPlayer || myPlayer.team === team) return;
    setBusy('team');
    try {
      await onSetTeam(team);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleReady = async () => {
    setBusy('ready');
    try {
      await onSetReady(!myPlayer?.isReady);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const makeLeader = async (targetId) => {
    setBusy(`leader:${targetId}`);
    try {
      await onMakeLeader(targetId);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const transferHostTo = async (targetId) => {
    setBusy(`host:${targetId}`);
    try {
      await onTransferHost(targetId);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const startAll = players.filter((p) => p.isReady).length;
  const canStart =
    (isHost || isLeader) && players.length >= MIN_PLAYERS && startAll === players.length;
  const mayLead = isHost || isLeader;

  return (
    <div className="lobby-shell mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col items-center gap-3">
        <RoomCode code={room.code} />
        <p className="text-sm text-slate-400">
          {players.length} من {MAX_PLAYERS} لاعب • لازم {MIN_PLAYERS} لاعب عشان نبدأ
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {TEAM_IDS.map((tid) => (
          <section
            key={tid}
            className={`lobby-team rounded-2xl border-2 p-4 ${
              tid === 'red' ? 'border-rose-500/30 bg-rose-500/5' : 'border-sky-500/30 bg-sky-500/5'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <TeamBadge teamId={tid} size="lg" />
              <span className="text-xs text-slate-400">
                {players.filter((p) => p.team === tid).length} لاعب
              </span>
            </div>

            {players.filter((p) => p.team === tid).length === 0 && (
              <p className="rounded-xl bg-night-800/60 px-3 py-4 text-center text-sm text-slate-500">
                الفريق فاضي — لسه في مكان 🪑
              </p>
            )}

            <div className="space-y-2">
              {players
                .filter((p) => p.team === tid)
                .map((p) => (
                  <PlayerCard
                    key={p.userId}
                    player={p}
                    isMe={p.userId === myPlayer?.userId}
                    isHost={p.userId === room.hostId}
                    busy={busy}
                    onMakeLeader={
                      mayLead && p.userId !== myPlayer?.userId ? makeLeader : undefined
                    }
                    onTransferHost={isHost && p.userId !== myPlayer?.userId ? transferHostTo : undefined}
                  />
                ))}
            </div>

            <button
              onClick={() => assignTeam(tid)}
              disabled={!myPlayer || myPlayer.team === tid || busy === 'team' || room.status !== 'lobby'}
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {myPlayer?.team === tid ? 'انت في الفريق ده ✓' : 'انضم للفريق ده'}
            </button>
          </section>
        ))}
      </div>

      {/* Controls */}
      <div className="lobby-controls glass mt-8 flex flex-col items-center gap-3 rounded-2xl p-5 sm:flex-row sm:justify-center">
        <button
          onClick={toggleReady}
          disabled={busy === 'ready' || !myPlayer}
          className={`w-full rounded-xl px-6 py-3 font-bold transition sm:w-auto ${
            myPlayer?.isReady
              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40'
              : 'bg-brand-500 text-night-950 hover:bg-brand-400'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {myPlayer?.isReady ? 'مش جاهز تاني' : 'أنا جاهز ✓'}
        </button>

        {mayLead && (
          <button
            onClick={onStartGame}
            disabled={!canStart}
            className="w-full rounded-xl bg-gold-500 px-6 py-3 font-black text-night-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {players.length < MIN_PLAYERS
              ? `لازم ${MIN_PLAYERS} لاعب على الأقل`
              : startAll === players.length
                ? 'ابدأ اللعبة 🚀'
                : `${startAll}/${players.length} جاهزين`}
          </button>
        )}

        <button
          onClick={onLeave}
          className="w-full rounded-xl border border-rose-500/40 px-6 py-3 font-bold text-rose-300 transition hover:bg-rose-500/10 sm:w-auto"
        >
          خروج من الغرفة
        </button>
      </div>
    </div>
  );
}
