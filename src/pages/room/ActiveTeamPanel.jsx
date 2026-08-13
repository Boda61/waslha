import AnswerCard from '../../components/AnswerCard.jsx';

export default function ActiveTeamPanel({
  challenge,
  round,
  isLeader,
  leaderLocked,
  mySubmitted,
  myChoiceIndex,
  onAnswer,
  submitting,
}) {
  const clue = round?.clue;

  return (
    <section className="animate-fade-up">
      {(isLeader || Number.isFinite(myChoiceIndex)) && (
        <p className="mb-3 text-center text-sm font-semibold text-emerald-300">
          {mySubmitted ? 'اخترت إجابتك ✓ مستني باقي الفريق' : 'لما الفريق يختار، اتأكد إن الكل موافق'}
        </p>
      )}

      <header className="mb-6 text-center">
        <p className="text-sm text-slate-400">
          {challenge.title} <span className="text-slate-600">•</span> فريقك هو اللي عليه الدور
        </p>
        <div className="mx-auto mt-3 max-w-md rounded-2xl border border-gold-500/30 bg-gold-500/10 px-6 py-4">
          <p className="text-xs font-semibold text-gold-300">تلميح القائد</p>
          <p className="mt-1 text-2xl font-black text-white">“{clue}”</p>
          <p className="mt-1 text-xs text-slate-400">
            حاجة واحدة بس من الأربعة صح. دلوقتي 4 اختيارات ⬇️
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {challenge.choices.map((choice, i) => {
          let state = 'default';
          if (mySubmitted && myChoiceIndex === i) state = 'selected';
          const locked = leaderLocked || mySubmitted || submitting;
          return (
            <AnswerCard
              key={i}
              index={i}
              choice={choice}
              state={state}
              disabled={locked}
              onClick={onAnswer}
            />
          );
        })}
      </div>

      {leaderLocked && (
        <p className="mt-4 rounded-xl bg-night-800 px-4 py-3 text-center text-sm text-slate-400">
          🛡️ انت القائد — متختارش الإجابة نيابة عن الفريق. خلي زمايلك يختاروا.
        </p>
      )}
    </section>
  );
}
