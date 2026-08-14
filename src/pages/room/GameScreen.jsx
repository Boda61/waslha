import { useEffect, useState } from 'react';
import Scoreboard from '../../components/Scoreboard.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';
import Timer from '../../components/Timer.jsx';
import PlayerCard from '../../components/PlayerCard.jsx';
import LeaderPanel from './LeaderPanel.jsx';
import ActiveTeamPanel from './ActiveTeamPanel.jsx';
import OpponentView from './OpponentView.jsx';
import RoundResultModal from './RoundResultModal.jsx';
import GameOverModal from './GameOverModal.jsx';
import { TIMERS, TOTAL_ROUNDS } from '../../utils/constants.js';

export default function GameScreen({
  room,
  players,
  round,
  challenge,
  predictions,
  myPlayer,
  onSubmitClue,
  onSubmitAnswer,
  onSubmitPrediction,
  onNextRound,
  onExpireRound,
  onLeave,
  leaving,
}) {
  const [clueSubmitting, setClueSubmitting] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [predictionSubmitting, setPredictionSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);

  // Reset local submission state when a new round starts.
  useEffect(() => {
    setExpired(false);
    setPendingChoice(null);
  }, [round?.id]);

  if (!room || !round || !challenge || !myPlayer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        بنجهز الجولة...
      </div>
    );
  }

  const activeTeam = round.activeTeam;
  const myUid = myPlayer.userId;
  const myTeam = myPlayer.team;
  const leaderId = round.leaderId;
  const isLeader = myUid === leaderId;
  const isActiveTeamMember = myTeam === activeTeam;
  const revealed = round.status === 'revealed';
  const ended = room.status === 'ended';
  const leaderLocked = isLeader; // The leader NEVER answers, even when alone.
  const leaderPlayer = players.find((p) => p.userId === leaderId);
  const leaderName = leaderPlayer?.username || 'القائد';
  const myPrediction = predictions.find((p) => p.userId === myUid)?.choiceIndex;
  const canChat = !revealed && isActiveTeamMember && round.status === 'clue_submitted';

  // Authoritative persisted answer state (survives refresh).
  const persistedChoiceIndex = round.selectedChoiceIndex;
  const mySubmitted = round.submittedBy === myUid;
  // Optimistic: show the clicked choice immediately while the RPC is in flight.
  const hasChosen = mySubmitted || pendingChoice !== null;
  const myChoiceIndex = mySubmitted ? persistedChoiceIndex : pendingChoice;

  const redMembers = players.filter((p) => p.team === 'red');
  const blueMembers = players.filter((p) => p.team === 'blue');

  const handleClue = async (clue) => {
    setClueSubmitting(true);
    try {
      await onSubmitClue(clue);
    } finally {
      setClueSubmitting(false);
    }
  };

  const handleAnswer = async (choiceIndex) => {
    if (answerSubmitting || hasChosen) return;
    setPendingChoice(choiceIndex);
    setAnswerSubmitting(true);
    try {
      await onSubmitAnswer(choiceIndex);
    } catch {
      setPendingChoice(null);
    } finally {
      setAnswerSubmitting(false);
    }
  };

  const handlePrediction = async (choiceIndex) => {
    if (predictionSubmitting) return;
    setPredictionSubmitting(true);
    try {
      await onSubmitPrediction(choiceIndex);
    } finally {
      setPredictionSubmitting(false);
    }
  };

  const handleTimerExpire = () => {
    if (revealed || ended || expired) return;
    setExpired(true);
    onExpireRound?.();
  };

  const renderMain = () => {
    if (revealed || ended) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="text-5xl animate-pulse">🎬</span>
          <p className="text-xl font-bold text-white">
            {revealed ? 'النتيجة...' : 'اللعبة خلصت'}
          </p>
        </div>
      );
    }

    if (expired) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-night-800 px-6 py-16 text-center">
          <span className="text-5xl">⏰</span>
          <p className="text-lg font-bold text-white">انتهى وقت الجولة!</p>
          <p className="text-sm text-slate-400">بنحوّل الدور للفريق التاني...</p>
        </div>
      );
    }

    if (isActiveTeamMember) {
      if (round.status === 'leader') {
        if (isLeader) {
          return <LeaderPanel challenge={challenge} onClue={handleClue} submitting={clueSubmitting} />;
        }
        return (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-night-800 px-6 py-16 text-center">
            <span className="text-5xl">🕵️</span>
            <p className="text-lg font-bold text-white">القائد بيشوف الصورتين وبيكتب التلميح...</p>
            <p className="text-sm text-slate-400">  متبقاش مستعجل اصبر... 😄</p>
          </div>
        );
      }
      // clue_submitted
      return (
        <ActiveTeamPanel
          challenge={challenge}
          round={round}
          isLeader={isLeader}
          leaderLocked={leaderLocked}
          mySubmitted={hasChosen}
          myChoiceIndex={myChoiceIndex}
          onAnswer={handleAnswer}
          submitting={answerSubmitting}
        />
      );
    }

    // opponent team
    return (
      <OpponentView
        challenge={challenge}
        round={round}
        activeTeam={activeTeam}
        leaderName={leaderName}
        myPrediction={myPrediction}
        onPrediction={handlePrediction}
        submitting={predictionSubmitting}
        revealed={revealed}
      />
    );
  };

  const teamSection = (teamId) => {
    const members = teamId === 'red' ? redMembers : blueMembers;
    return (
      <section
        className={`team-card rounded-2xl border-2 p-3 ${
          teamId === 'red'
            ? 'border-rose-500/20 bg-rose-500/5'
            : 'border-sky-500/20 bg-sky-500/5'
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <TeamBadge teamId={teamId} size="lg" />
          <span className="text-xs text-slate-400">{members.length} لاعب</span>
        </div>
        <div className="space-y-2">
          {members.length === 0 && (
            <p className="rounded-xl bg-night-800/60 px-3 py-3 text-center text-xs text-slate-500">
              الفريق فاضي — لسه في مكان 🪑
            </p>
          )}
          {members.map((p) => (
            <PlayerCard
              key={p.userId}
              player={p}
              isMe={p.userId === myUid}
              isHost={room.hostId === p.userId}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="game-shell mx-auto max-w-6xl px-4 py-6">
      {/* Scoreboard */}
      <div className="gs-score mb-4">
        <Scoreboard room={room} />
      </div>

      {/* Leave button */}
      <div className="gs-leave mb-4 flex justify-end">
        <button
          onClick={onLeave}
          disabled={leaving}
          className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
        >
          {leaving ? '...' : 'خروج من اللعبة'}
        </button>
      </div>

      {/* Status bar */}
      <div className="gs-status glass mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="round-chip rounded-lg bg-night-700 px-3 py-1 text-sm font-bold text-white">
            جولة {Math.min(room.currentRound, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
          </span>
          <span className="team-turn flex items-center gap-2 text-sm text-slate-300">
            الدور على <TeamBadge teamId={activeTeam} />
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!revealed && !ended && !expired && (
            <Timer
              deadline={round.endsAt}
              durationSeconds={TIMERS.answerSeconds}
              key={round.id}
              onExpire={handleTimerExpire}
            />
          )}
          {expired && (
            <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-bold text-rose-300">
              انتهى الوقت ⏰
            </span>
          )}
          {revealed && (
            <span className="rounded-full bg-gold-500/20 px-3 py-1 text-sm font-bold text-gold-300">
              نتيجة الجولة 🎬
            </span>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="gs-teams mb-4 grid gap-4 sm:grid-cols-2">
        {teamSection('red')}
        {teamSection('blue')}
      </div>

      {/* Main + Chat */}
      <div className="gs-main grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="gs-main-box rounded-2xl border border-white/10 bg-night-900/40 p-4 sm:p-6">
          {myPlayer.team ? (
            renderMain()
          ) : (
            <p className="py-16 text-center text-slate-400">مفيش فريق لسه...</p>
          )}
        </div>

        <div className="gs-chat h-[420px] lg:h-[560px]">
          <ChatPanel
            roomId={room.id}
            roundId={round.id}
            canChat={canChat}
            currentPlayer={myPlayer}
          />
        </div>
      </div>

      {revealed && !ended && (
        <RoundResultModal round={round} isHost={room.hostId === myUid} onNextRound={onNextRound} />
      )}
      {ended && <GameOverModal room={room} players={players} />}
    </div>
  );
}