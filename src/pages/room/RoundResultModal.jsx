import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

export default function RoundResultModal({ round, isHost, isLeader, onNextRound }) {
  const [count, setCount] = useState(6);
  const isTimeout = round?.result === 'timeout';
  const winnerTeam = round?.winningTeam;
  const canAdvance = isHost || isLeader;

  // Host/leader is responsible for advancing after the countdown.
  useEffect(() => {
    if (count <= 0) {
      onNextRound?.();
      return undefined;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onNextRound]);

  return (
    <Modal open>
      <div className="text-center">
        <span className="text-6xl">{isTimeout ? '⏰' : '🎉'}</span>
        <h2 className="mt-2 text-3xl font-black text-white">
          {isTimeout
            ? 'محدش فاز بالجولة — 0 نقطة'
            : winnerTeam
              ? 'إجابة صح! +100'
              : 'إجابة صح!'}
        </h2>
        <p className="mt-1 text-slate-300">
          {isTimeout
            ? 'الوقت خلص ومحدش عرف يجيبها صح 🤷'
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

        {winnerTeam && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <TeamBadge teamId={winnerTeam} size="lg" />
          </div>
        )}

        <p className="mt-5 text-3xl font-black text-gold-300">{count}</p>
        <p className="text-sm text-slate-400">
          {canAdvance ? 'العداد بيوصل للجولة الجاية...' : 'منتظرين الجولة الجاية...'}
        </p>

        {canAdvance && (
          <button
            onClick={onNextRound}
            className="mt-4 rounded-xl bg-brand-500 px-6 py-2 font-bold text-night-950 transition hover:bg-brand-400"
          >
            الجولة الجاية دلوقتي ⏭
          </button>
        )}
      </div>
    </Modal>
  );
}