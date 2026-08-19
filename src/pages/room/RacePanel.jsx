import AnswerCard from '../../components/AnswerCard.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';

// The race panel. After the hint is submitted, everyone plays at the same time.
//   * teams mode: BOTH teams race; the first correct TEAM wins the round.
//   * solo mode : every player is on their own; the first correct PLAYER wins.
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
  mode,
  players,
  answers,
  onAnswer,
  submitting,
  pendingChoice,
}) {
  const clue = round?.clue;
  const revealed = round?.status === 'revealed';
  const winnerTeam = round?.winningTeam;
  const winnerUserId = round?.winningUserId;
  const correctIndex = round?.correctIndex;
  const soloMode = mode === 'solo';

  const mySubmission = myUid ? answers.find((a) => a.userId === myUid) : null;
  const myChoiceIndex = mySubmission ? mySubmission.choiceIndex : pendingChoice;

  // In teams mode the whole team's wrong picks are shown; in solo mode only
  // your own wrong pick matters.
  const teamWrongChoices = soloMode
    ? mySubmission && !mySubmission.isCorrect
      ? [mySubmission.choiceIndex]
      : []
    : answers.filter((a) => a.team === myTeam && !a.isCorrect).map((a) => a.choiceIndex);

  const redAttempts = answers.filter((a) => a.team === 'red').length;
  const blueAttempts = answers.filter((a) => a.team === 'blue').length;

  // Leader never answers; in teams mode a player without a team can't answer
  // yet; once a player's answer is recorded they cannot answer again; the
  // round locks down once revealed.
  const locked =
    isLeader ||
    (!soloMode && !myTeam) ||
    revealed ||
    submitting ||
    !!mySubmission;

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

  const winnerPlayer = winnerUserId
    ? (players || []).find((p) => p.userId === winnerUserId)
    : null;

  const answeredPlayers = (answers || [])
    .map((a) => {
      const p = (players || []).find((pl) => pl.userId === a.userId);
      return { ...a, username: p?.username || '?' };
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const raceStatus = () => {
    if (soloMode) {
      return (
        <div className="race-status mb-4 rounded-2xl border border-white/10 bg-night-800/50 px-3 py-2 text-center">
          <p className="text-xs text-slate-400">
            {answers.length} {answers.length === 1 ? 'إجابة' : 'إجابات'} اتسجلت — أول واحد
            يجاوب صح ياخد الـ 100 نقطة
          </p>
        </div>
      );
    }
    return (
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
    );
  };

  return (
    <section className="animate-fade-up">
      <header className="mb-5 text-center">
        <p className="text-sm text-slate-400">
          {challenge.title} <span className="text-slate-600">•</span>{' '}
          {soloMode ? 'السباق شغال — كل واحد لوحده ⚡' : 'السباق شغال بين الفريقين ⚡'}
        </p>
        <div className="clue-card mx-auto mt-3 max-w-md rounded-2xl border border-gold-500/30 bg-gold-500/10 px-6 py-4">
          <p className="text-xs font-semibold text-gold-300">تلميح القائد</p>
          <p className="clue-text mt-1 text-2xl font-black text-white">“{clue}”</p>
          <p className="mt-1 text-xs text-slate-400">
            {soloMode
              ? 'حاجة واحدة بس من الأربعة صح — أول واحد يجاوب صح يكسب!'
              : 'حاجة واحدة بس من الأربعة صح — أسرع فريق يجاوب صح يكسب!'}
          </p>
        </div>
      </header>

      {revealed && (
        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
          <p className="text-lg font-black text-white">
            {winnerTeam || winnerPlayer ? (
              soloMode ? (
                <>
                  <span className="mr-1 text-2xl">{winnerPlayer?.avatar}</span>
                  {winnerPlayer?.username} كسب الجولة +100 🏆
                </>
              ) : (
                <>
                  <TeamBadge teamId={winnerTeam} size="lg" /> كسب الجولة 🏆
                </>
              )
            ) : (
              <>⏰ الجولة خلصت من غير فائز</>
            )}
          </p>
        </div>
      )}

      {!revealed && !isLeader && mySubmission && !mySubmission.isCorrect && (
        <p className="mb-4 rounded-xl bg-rose-500/15 px-4 py-3 text-center text-sm font-semibold text-rose-300">
          ✗ إجابتك غلط — {soloMode ? 'استنى بقية اللاعبين يحاولوا' : 'استنى زمايلك يحاولوا، أو شوف الفريق التاني'}
        </p>
      )}

      {raceStatus()}

      {soloMode && answeredPlayers.length > 0 && !revealed && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-night-800/50 px-4 py-3">
          <p className="mb-2 text-xs font-bold text-slate-400">مين جاب إجابة:</p>
          <div className="flex flex-wrap gap-2">
            {answeredPlayers.map((a) => (
              <span
                key={a.userId}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  a.isCorrect
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-night-700 text-slate-400'
                }`}
              >
                {a.username} {a.isCorrect ? '🎉' : '✗'}
              </span>
            ))}
          </div>
        </div>
      )}

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
          🛡️ انت القائد — القائد بيتفرج على السباق ومش بيجاوب. خلي البقية يختاروا.
        </p>
      )}
      {!isLeader && !myTeam && soloMode && (
        <p className="mt-4 rounded-xl bg-night-800 px-4 py-3 text-center text-sm text-slate-400">
          اختار إجابة من الأربعة — أول واحد صح ياخد النقاط ⚡
        </p>
      )}
      {!isLeader && !myTeam && !soloMode && (
        <p className="mt-4 rounded-xl bg-night-800 px-4 py-3 text-center text-sm text-slate-400">
          مفيش فريق لسه — استنى الجولة الجاية واختار فريق عشان تلعب.
        </p>
      )}
    </section>
  );
}
