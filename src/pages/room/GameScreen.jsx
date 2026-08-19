import { useEffect, useState } from 'react';
import Scoreboard from '../../components/Scoreboard.jsx';
import ChatLauncher from '../../components/ChatLauncher.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';
import Timer from '../../components/Timer.jsx';
import PlayerCard from '../../components/PlayerCard.jsx';
import LeaderPanel from './LeaderPanel.jsx';
import RacePanel from './RacePanel.jsx';
import RoundResultModal from './RoundResultModal.jsx';
import GameOverModal from './GameOverModal.jsx';
import { TIMERS, TOTAL_ROUNDS } from '../../utils/constants.js';

export default function GameScreen({
  room,
  players,
  round,
  challenge,
  answers,
  myPlayer,
  isLeader,
  onSubmitClue,
  onSubmitAnswer,
  onMakeLeader,
  onNextRound,
  onExpireRound,
  onSetTeam,
  onLeave,
  leaving,
}) {
  const [clueSubmitting, setClueSubmitting] = useState(false);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
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

  const soloMode = room.mode === 'solo';
  const myUid = myPlayer.userId;
  const myTeam = myPlayer.team;
  const revealed = round.status === 'revealed';
  const ended = room.status === 'ended';
  const inCluePhase = round.status === 'leader';
  const inRace = round.status === 'clue_submitted';
  const leaderLocked = isLeader; // The leader NEVER answers, even when alone.
  const canChat = !revealed && inRace && (soloMode || !!myTeam);

  const redMembers = players.filter((p) => p.team === 'red');
  const blueMembers = players.filter((p) => p.team === 'blue');
  const neutralMembers = players.filter((p) => !p.team);

  const handleClue = async (clue) => {
    setClueSubmitting(true);
    try {
      await onSubmitClue(clue);
    } finally {
      setClueSubmitting(false);
    }
  };

  const handleAnswer = async (choiceIndex) => {
    if (answerSubmitting || pendingChoice !== null || leaderLocked) return;
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
          <p className="text-sm text-slate-400">الجولة دي خلصت من غير فائز...</p>
        </div>
      );
    }

    if (inCluePhase) {
      if (isLeader) {
        return (
          <LeaderPanel
            challenge={challenge}
            onClue={handleClue}
            submitting={clueSubmitting}
            players={players}
            myUid={myUid}
            onMakeLeader={onMakeLeader}
          />
        );
      }
      if (!myTeam && !soloMode) {
        return (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-night-800 px-6 py-16 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-lg font-bold text-white">اختار فريقك عشان تلعب</p>
            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
              <button
                onClick={() => onSetTeam?.('red')}
                className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 font-bold text-rose-300 transition hover:bg-rose-500/20"
              >
                🔴 الفريق الأحمر
              </button>
              <button
                onClick={() => onSetTeam?.('blue')}
                className="rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 font-bold text-sky-300 transition hover:bg-sky-500/20"
              >
                🔵 الفريق الأزرق
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-night-800 px-6 py-16 text-center">
          <span className="text-5xl">🕵️</span>
          <p className="text-lg font-bold text-white">القائد بيشوف الصورتين وبيكتب التلميح...</p>
          <p className="text-sm text-slate-400">متبقاش مستعجل اصبر... 😄</p>
        </div>
      );
    }

    // inRace (clue_submitted): everyone plays at the same time.
    return (
      <RacePanel
        challenge={challenge}
        round={round}
        myUid={myUid}
        myTeam={myTeam}
        isLeader={isLeader}
        mode={room.mode}
        players={players}
        answers={answers}
        onAnswer={handleAnswer}
        submitting={answerSubmitting}
        pendingChoice={pendingChoice}
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
              isLeader={p.userId === room.leaderId}
            />
          ))}
        </div>
      </section>
    );
  };

  const phaseLabel = () => {
    if (revealed) return 'نتيجة الجولة 🎬';
    if (ended) return 'اللعبة خلصت 🏁';
    if (inCluePhase) return 'القائد بيجهز التلميح 🕵️';
    return soloMode ? 'السباق شغال — كل واحد لوحده ⚡' : 'السباق شغال بين الفريقين ⚡';
  };

  return (
    <div className="game-shell mx-auto max-w-6xl px-4 py-6">
      {/* Scoreboard */}
      <div className="gs-score mb-4">
        <Scoreboard room={room} mode={room.mode} players={players} />
      </div>

      {/* Leave + chat toggle */}
      <div className="gs-leave mb-4 flex items-center justify-end gap-2">
        <ChatLauncher
          roomId={room.id}
          roundId={round.id}
          canChat={canChat}
          currentPlayer={myPlayer}
        />
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
            {phaseLabel()}
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

      {/* Roster */}
      {soloMode ? (
        <section className="mb-4 rounded-2xl border-2 border-gold-500/25 bg-gold-500/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-black text-gold-300">⚡ اللاعبين — كل واحد لوحده</span>
            <span className="text-xs text-slate-400">{players.length} لاعب</span>
          </div>
          <div className="space-y-2">
            {players.map((p) => (
              <PlayerCard
                key={p.userId}
                player={p}
                isMe={p.userId === myUid}
                isHost={room.hostId === p.userId}
                isLeader={p.userId === room.leaderId}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* Neutral leader — outside both teams */}
          {neutralMembers.length > 0 && (
            <div className="mb-4 rounded-2xl border-2 border-gold-500/25 bg-gold-500/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-black text-gold-300">🕵️ القائد — بره الفريقين</span>
                <span className="text-xs text-slate-400">{neutralMembers.length} لاعب</span>
              </div>
              <div className="space-y-2">
                {neutralMembers.map((p) => (
                  <PlayerCard
                    key={p.userId}
                    player={p}
                    isMe={p.userId === myUid}
                    isHost={room.hostId === p.userId}
                    isLeader={p.userId === room.leaderId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Teams */}
          <div className="gs-teams mb-4 grid gap-4 sm:grid-cols-2">
            {teamSection('red')}
            {teamSection('blue')}
          </div>
        </>
      )}

      {/* Main gameplay */}
      <div className="gs-main">
        <div className="gs-main-box rounded-2xl border border-white/10 bg-night-900/40 p-4 sm:p-6">
          {renderMain()}
        </div>
      </div>

      {revealed && !ended && (
        <RoundResultModal
          round={round}
          isHost={room.hostId === myUid}
          isLeader={isLeader}
          mode={room.mode}
          players={players}
          onNextRound={onNextRound}
        />
      )}
      {ended && <GameOverModal room={room} players={players} />}
    </div>
  );
}
