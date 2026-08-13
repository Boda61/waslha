import AnswerCard from '../../components/AnswerCard.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

export default function OpponentView({
  challenge,
  round,
  activeTeam,
  leaderName,
  myPrediction,
  onPrediction,
  submitting,
  revealed,
}) {
  const clueSubmitted = round?.status !== 'leader';
  const canPredict =
    !revealed && clueSubmitted && myPrediction === undefined && !submitting;

  const handlePick = (i) => {
    if (canPredict) onPrediction(i);
  };

  return (
    <section className="animate-fade-up">
      <header className="text-center">
        <p className="text-sm text-slate-400">👀 انت بتتفرج على الفريق التاني وهو شغال</p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <TeamBadge teamId={activeTeam} size="lg" />
          <span className="text-sm text-slate-300">
            قائدهم: <span className="font-bold text-white">{leaderName}</span>
          </span>
        </div>
      </header>

      {!clueSubmitted ? (
        <p className="mt-8 rounded-2xl bg-night-800 px-6 py-8 text-center text-lg text-slate-300">
          القائد بيشوف الصورتين السرية وبيكتب التلميح... مستني 🤫
        </p>
      ) : (
        <div className="mt-6">
          <div className="mx-auto mb-5 max-w-md rounded-2xl border border-gold-500/30 bg-gold-500/10 px-6 py-4 text-center">
            <p className="text-xs font-semibold text-gold-300">التلميح</p>
            <p className="mt-1 text-2xl font-black text-white">“{round.clue}”</p>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {challenge.choices.map((choice, i) => {
              let state = 'dimmed';
              if (revealed && i === round.correctIndex) state = 'correct';
              if (revealed && i === round.selectedChoiceIndex && round.selectedChoiceIndex !== round.correctIndex)
                state = 'incorrect';
              if (myPrediction === i) state = 'default';
              return (
                <AnswerCard
                  key={i}
                  index={i}
                  choice={choice}
                  state={revealed ? (state === 'dimmed' && myPrediction !== i ? 'dimmed' : state) : state}
                  disabled={!canPredict}
                  onClick={handlePick}
                />
              );
            })}
          </div>

          <div className="rounded-2xl bg-night-800/70 px-4 py-3 text-center text-sm">
            {myPrediction !== undefined ? (
              <p className="text-gold-300">
                🔮 توقعت اختيار {myPrediction + 1} — لو صح بتاخد نقاط زيادة!
              </p>
            ) : (
              <p className="text-slate-400">
                🔮 عايز تدخل الجو؟ اعمل توقع للإجابة الصح (مش بيأثر على الفريق التاني)
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
