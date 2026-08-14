import AnswerCard from '../../components/AnswerCard.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

// The Team Race panel. After the hint is submitted, BOTH teams play at the
// same time. Each player sees the hint + the 4 choices and picks one.
// The single room leader watches (never answers).
//
// The authoritative state comes from the `answers` list (round_answers rows
// pushed over realtime from the DB). `pendingChoice` is only a temporary
// optimistic overlay while the RPC is in flight.
export default function RacePanel({
  challenge,
  round,
  myUid,
  myTeam,
  isLeader,
  answers,
  onAnswer,
  submitting,
  pendingChoice,
}) {
  const clue = round?.clue;
  const revealed = round?.status === 'revealed';
  const winnerTeam = round?.winningTeam;
  const correctIndex = round?.correctIndex;

  const mySubmission = myUid ? answers.find((a) => a.userId === myUid) : null;
  const myChoiceIndex = mySubmission ? mySubmission.choiceIndex : pendingChoice;
  const teamWrongChoices = answers
    .filter((a) => a.team === myTeam && !a.isCorrect)
    .map((a) => a.choiceIndex);
  const redAttempts = answers.filter((a) => a.team === 'red').length;
  const blueAttempts = answers.filter((a) => a.team === 'blue').length;

  // Leader never answers; a player without a team can't answer yet; once a
  // player's answer is recorded they cannot answer again; the round locks
  // down once revealed.
  const locked = isLeader || !myTeam || revealed || submitting || !!mySubmission;

  const stateFor = (i) => {
    if (revealed) {
      if (i === correctIndex) return 'correct';
      if (mySubmission && i === mySubmission.choiceIndex && !mySubmission.isCorrect) {
        return 'incorrect';
      }
      return 'dimmed';
    }
    if (teamWrongChoices.includes(i)) return 'incorrect';
    if (myChoiceIndex === i) return 'selected';
    return 'default';
  };

  return (
    <section className="animate-fade-up">
      <header className="mb-5 text-center">
        <p className="text-sm text-slate-400">
          {challenge.title} <span className="text-slate-600">•</span> السباق شغال بين الفريقين ⚡
        </p>
        <div className="clue-card mx-auto mt-3 max-w-md rounded-2xl border border-gold-500/30 bg-gold-500/10 px-6 py-4">
          <p className="text-xs font-semibold text-gold-300">تلميح القائد</p>
          <p className="clue-text mt-1 text-2xl font-black text-white">“{clue}”</p>
          <p className="mt-1 text-xs text-slate-400">حاجة واحدة بس من الأربعة صح — أسرع فريق يجاوب صح يكسب!</p>
        </div>
      </header>

      {revealed && (
        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
          <p className="text-lg font-black text-white">
            {winnerTeam ? (
              <>
                <TeamBadge teamId={winnerTeam} size="lg" /> كسب الجولة 🏆
              </>
            ) : (
              <>⏰ الجولة خلصت من غير فائز</>
            )}
          </p>
        </div>
      )}

      {!revealed && !isLeader && mySubmission && !mySubmission.isCorrect && (
        <p className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center text-sm font-semibold text-rose-300">
          ✗ إجابتك غلط — استنى زمايلك يحاولوا، أو شوف الفريق التاني
        </p>
      )}

      <div className="race-status mb-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-3 py-2">
          <TeamBadge teamId="red" />
          <p className="mt-1 text-xs text-slate-400">{redAttempts} محاولة</p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-3 py-2">
          <TeamBadge teamId="blue" />
          <p className="mt-1 text-xs text-slate-400">{blueAttempts} محاولة</p>
        </div>
      </div>

      <div className="choice-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
        {challenge.choices.map((choice, i) => (
          <AnswerCard
            key={i}
            index={i}
            choice={choice}
            state={stateFor(i)}
            disabled={locked}
            onClick={onAnswer}
          />
        ))}
      </div>

      {isLeader && (
        <p className="mt-4 rounded-xl bg-night-800 px-4 py-3 text-center text-sm text-slate-400">
          🛡️ انت القائد — القائد بيتفرج على السباق ومش بيجاوب. خلي زمايلك يختاروا.
        </p>
      )}
      {!isLeader && !myTeam && (
        <p className="mt-4 rounded-xl bg-night-800 px-4 py-3 text-center text-sm text-slate-400">
          مفيش فريق لسه — استنى الجولة الجاية واختار فريق عشان تلعب.
        </p>
      )}
    </section>
  );
}