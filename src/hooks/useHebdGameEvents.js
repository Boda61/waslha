import { useEffect, useRef, useCallback } from 'react';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  useHebdGameEvents — round win / game end hooks with duplicate guard     │
// │                                                                         │
// │  Fires onRoundWin / onGameEnd exactly ONCE per match lifecycle.         │
// │  Tracks processed round IDs and match end state to prevent duplicates   │
// │  from realtime rerenders, reconnects, or manual refresh.                │
// └─────────────────────────────────────────────────────────────────────────┘

export default function useHebdGameEvents({ match, round, players, myUserId, onRoundWin, onGameEnd }) {
  // Track which round wins we've already fired for
  const firedRoundWins = useRef(new Set());
  // Track whether we've already fired game end for this match
  const firedGameEnd = useRef(false);
  // Track previous round status to detect transitions
  const prevRoundStatus = useRef(null);
  // Track previous match status
  const prevMatchStatus = useRef(null);

  // Reset tracking when match changes
  useEffect(() => {
    if (!match) {
      firedGameEnd.current = false;
      firedRoundWins.current.clear();
      prevRoundStatus.current = null;
      prevMatchStatus.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.roomId]);

  // Derive current scores from players array
  const getScores = useCallback(() => {
    if (!players || players.length === 0) return {};
    const scores = {};
    for (const p of players) {
      scores[p.userId] = p.score || 0;
    }
    return scores;
  }, [players]);

  // ── Round Win Detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!round || !match || !onRoundWin) return;

    // Only fire on transition to 'revealed' status
    if (round.status === 'revealed' && prevRoundStatus.current !== 'revealed') {
      const roundId = round.id;

      // Duplicate protection: skip if we already fired for this round
      if (firedRoundWins.current.has(roundId)) return;

      // Only fire if there's a winner
      if (round.winnerUserId) {
        firedRoundWins.current.add(roundId);

        const winnerUserId = round.winnerUserId;
        const loserUserId = players.find((p) => p.userId !== winnerUserId)?.userId || null;
        const scores = getScores();

        onRoundWin({
          roundId,
          roundNumber: round.roundNumber,
          winnerUserId,
          loserUserId,
          scores,
          isMyWin: winnerUserId === myUserId,
        });
      }
    }

    prevRoundStatus.current = round.status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, round?.id, round?.winnerUserId, match, players, myUserId, onRoundWin, getScores]);

  // ── Game End Detection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!match || !onGameEnd) return;

    // Only fire on transition to 'ended' status
    if (match.status === 'ended' && prevMatchStatus.current !== 'ended') {
      // Duplicate protection: skip if we already fired game end
      if (firedGameEnd.current) return;

      firedGameEnd.current = true;

      const winnerUserId = match.winnerUserId;
      const scores = getScores();

      // Determine if it's a draw (no winner or tie)
      const isDraw = !winnerUserId;

      onGameEnd({
        matchId: match.roomId,
        winnerUserId: isDraw ? null : winnerUserId,
        loserUserId: isDraw ? null : players.find((p) => p.userId !== winnerUserId)?.userId || null,
        scores,
        roundsPlayed: match.currentRound,
        isDraw,
        isMyWin: winnerUserId === myUserId,
      });
    }

    prevMatchStatus.current = match.status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.roomId, match?.winnerUserId, match?.currentRound, players, myUserId, onGameEnd, getScores]);

  return {
    resetRoundWins: () => firedRoundWins.current.clear(),
    resetGameEnd: () => { firedGameEnd.current = false; },
    resetAll: () => { firedRoundWins.current.clear(); firedGameEnd.current = false; },
  };
}