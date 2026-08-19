import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

export default function RoundResultModal({ round, isHost, isLeader, mode, players, onNextRound }) {
  const [count, setCount] = useState(6);
  const [advanced, setAdvanced] = useState(false);
  const isTimeout = round?.result === 'timeout';
  const winnerTeam = round?.winningTeam;
  const soloMode = mode === 'solo';
  const winnerPlayer = round?.winningUserId
    ? (players || []).find((p) => p.userId === round.winningUserId)
    : null;
  const canAdvance = isHost || isLeader;

  // Only the host or leader advances the game, and only ONCE per result.
  // Without these guards every client (and every re-render once the count
  // reaches 0) fires next_round — non-privileged calls get a 400
  // "انت مش صاحب الغرفة أو القائد" and duplicate calls a 400
  // "دي مش الجولة الحالية".
  useEffect(() => {
    if (count <= 0) {
      if (!canAdvance || advanced) return undefined;
      setAdvanced(true);
      onNextRound?.();
      return undefined;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onNextRound, canAdvance, advanced]);

  const handleAdvance = () => {
    if (advanced) return;
    setAdvanced(true);
    onNextRound?.();
  };

  return (
    <Modal open>
      <div className="text-center">
        <span className="text-6xl">{isTimeout ? '⏰' : '🎉'}</span>
        <h2 className="mt-2 text-3xl font-black text-white">
          {isTimeout
            ? 'محدش فاز بالجولة — 0 نقطة'
            : soloMode
              ? 'إجابة صح! +100'
              : winnerTeam
                ? 'إجابة صح! +100'
                : 'إجابة صح!'}
        </h2>
        <p className="mt-1 text-slate-300">
          {isTimeout
            ? 'الوقت خلص ومحدش عرف يجيبها صح 🤷'
            : soloMode
              ? `يا سلام! ${winnerPlayer?.username ?? 'اللاعب'} جابها الأول 😎`
              : winnerTeam
                ? 'يا سلام! الفريق اللي فاز جه على طول 😎'
                : 'إجابة صحيحة اتسجلت!'}
        </p>

        <div className="mt-4 rounded-2xl bg-night-800 p-4 text-right">
          <p className="text-xs text-slate-400">الإجابة الصح كانت</p>
          <p className="text-xl font-black text-emerald-300">
            {round?.correctAnswer ?? '—'}
          </p>
        </div>

        {!isTimeout && (winnerTeam || winnerPlayer) && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {soloMode ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-500/15 px-5 py-2 text-lg font-black text-gold-300 ring-1 ring-gold-500/30">
                <span className="text-2xl">{winnerPlayer?.avatar}</span>
                {winnerPlayer?.username}
              </span>
            ) : (
              <TeamBadge teamId={winnerTeam} size="lg" />
            )}
          </div>
        )}

        <p className="mt-5 text-3xl font-black text-gold-300">{count}</p>
        <p className="text-sm text-slate-400">
          {canAdvance ? 'العداد بيوصل للجولة الجاية...' : 'منتظرين الجولة الجاية...'}
        </p>

        {canAdvance && (
          <button
            onClick={handleAdvance}
            disabled={advanced}
            className="mt-4 rounded-xl bg-brand-500 px-6 py-2 font-bold text-night-950 transition hover:bg-brand-400 disabled:opacity-50"
          >
            الجولة الجاية دلوقتي ⏭
          </button>
        )}
      </div>
    </Modal>
  );
}