import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

export default function RoundResultModal({ round, isHost, onNextRound }) {
  const [count, setCount] = useState(6);
  const correct = round?.result === 'correct';

  // Host is responsible for advancing after the countdown.
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
        <span className="text-6xl">{correct ? '🎉' : '😬'}</span>
        <h2 className="mt-2 text-3xl font-black text-white">
          {correct ? 'إجابة صح! +100' : 'إجابة غلط — 0 نقطة'}
        </h2>
        <p className="mt-1 text-slate-300">
          {correct ? 'يا سلام عليكم! الفريق واصل 😎' : 'معلش، الفريق التاني هيمشيها المرة الجاية 🤷'}
        </p>

        <div className="mt-4 rounded-2xl bg-night-800 p-4 text-right">
          <p className="text-xs text-slate-400">الإجابة الصح كانت</p>
          <p className="text-xl font-black text-emerald-300">
            {round?.correctAnswer ?? '—'}
          </p>
          <p className="mt-2 text-xs text-slate-400">اللي فريقك اختاره</p>
          <p className={`text-xl font-black ${correct ? 'text-emerald-300' : 'text-rose-300 line-through'}`}>
            {round?.selectedAnswer ?? '—'}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <TeamBadge teamId={round?.activeTeam} />
        </div>

        <p className="mt-5 text-3xl font-black text-gold-300">{count}</p>
        <p className="text-sm text-slate-400">
          {isHost ? 'العداد بيوصل للجولة الجاية...' : 'منتظرين الجولة الجاية...'}
        </p>

        {isHost && (
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
