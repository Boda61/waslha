import { useState, useEffect, useCallback, useRef } from 'react';
import {
  callUseHebdRedCard,
  callUseHebdGreenCard,
  submitHebdRedQuestion,
  answerHebdRedQuestion,
  provideHebdGreenHint,
  subscribeHebdCardUses,
  subscribeHebdRedCardQuestions,
  subscribeHebdGreenCardHints,
} from '../services/hebdService.js';

// useHebdCards — manages Red and Green card state (server-authoritative)
export default function useHebdCards({ roomId, roundId, match, round, myUserId }) {
  const [cardUses, setCardUses] = useState([]);
  const [redQuestions, setRedQuestions] = useState([]);
  const [greenHint, setGreenHint] = useState(null);
  const [usingRed, setUsingRed] = useState(false);
  const [usingGreen, setUsingGreen] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [answeringQuestion, setAnsweringQuestion] = useState(false);
  const [providingHint, setProvidingHint] = useState(false);
  const processedRef = useRef(new Set());

  const isPlaying = match?.status === 'playing';
  const isRevealed = round?.status === 'revealed';
  const isGuesser = round?.guesserId === myUserId;
  const isPresenter = round?.presenterId === myUserId;

  const myCardUses = cardUses.filter((cu) => cu.userId === myUserId);
  const redUsed = myCardUses.some((cu) => cu.card === 'red');
  const greenUsed = myCardUses.some((cu) => cu.card === 'green');

  const activeRedQuestions = redQuestions.filter(
    (q) => q.roundId === roundId && cardUses.some((cu) => cu.card === 'red' && cu.roundId === q.roundId)
  );
  const remainingQuestions = activeRedQuestions.filter((q) => !q.question).length;

  useEffect(() => {
    if (!roomId || !isPlaying) { setCardUses([]); return undefined; }
    return subscribeHebdCardUses(roomId, (uses) => setCardUses(uses || []), (err) => console.error(err));
  }, [roomId, isPlaying]);

  useEffect(() => {
    if (!roomId || !roundId || !isPlaying) { setRedQuestions([]); return undefined; }
    setRedQuestions([]);
    return subscribeHebdRedCardQuestions(roomId, roundId, (q) => setRedQuestions(q || []), (err) => console.error(err));
  }, [roomId, roundId, isPlaying]);

  useEffect(() => {
    if (!roomId || !roundId || !isPlaying) { setGreenHint(null); return undefined; }
    setGreenHint(null);
    return subscribeHebdGreenCardHints(roomId, roundId, (h) => setGreenHint(h || null), (err) => console.error(err));
  }, [roomId, roundId, isPlaying]);

  const handleUseRedCard = useCallback(async () => {
    if (!roomId || usingRed || redUsed || !isGuesser || isRevealed) return null;
    const eventId = `red-${roomId}-${myUserId}`;
    if (processedRef.current.has(eventId)) return null;
    setUsingRed(true);
    try {
      const r = await callUseHebdRedCard(roomId);
      processedRef.current.add(eventId);
      return r;
    } finally {
      setUsingRed(false);
    }
  }, [roomId, usingRed, redUsed, isGuesser, isRevealed, myUserId]);

  const handleSubmitRedQuestion = useCallback(async (question) => {
    if (!roomId || submittingQuestion || !isGuesser || isRevealed) return null;
    setSubmittingQuestion(true);
    try {
      return await submitHebdRedQuestion(roomId, question);
    } finally {
      setSubmittingQuestion(false);
    }
  }, [roomId, submittingQuestion, isGuesser, isRevealed]);

  const handleAnswerRedQuestion = useCallback(async (answer) => {
    if (!roomId || answeringQuestion || !isPresenter || isRevealed) return null;
    setAnsweringQuestion(true);
    try {
      return await answerHebdRedQuestion(roomId, answer);
    } finally {
      setAnsweringQuestion(false);
    }
  }, [roomId, answeringQuestion, isPresenter, isRevealed]);

  const handleUseGreenCard = useCallback(async () => {
    if (!roomId || usingGreen || greenUsed || !isGuesser || isRevealed) return null;
    const eventId = `green-${roomId}-${myUserId}`;
    if (processedRef.current.has(eventId)) return null;
    setUsingGreen(true);
    try {
      const r = await callUseHebdGreenCard(roomId);
      processedRef.current.add(eventId);
      return r;
    } finally {
      setUsingGreen(false);
    }
  }, [roomId, usingGreen, greenUsed, isGuesser, isRevealed, myUserId]);

  const handleProvideGreenHint = useCallback(async (hint) => {
    if (!roomId || providingHint || !isPresenter || isRevealed) return null;
    setProvidingHint(true);
    try {
      return await provideHebdGreenHint(roomId, hint);
    } finally {
      setProvidingHint(false);
    }
  }, [roomId, providingHint, isPresenter, isRevealed]);

  return {
    cardUses, redUsed, greenUsed, myCardUses,
    redQuestions: activeRedQuestions, remainingQuestions,
    redActive: redUsed && !isRevealed,
    greenHint, greenRequested: greenUsed && !greenHint?.hint, greenProvided: !!greenHint?.hint,
    usingRed, usingGreen, submittingQuestion, answeringQuestion, providingHint,
    useRedCard: handleUseRedCard, useGreenCard: handleUseGreenCard,
    submitRedQuestion: handleSubmitRedQuestion, answerRedQuestion: handleAnswerRedQuestion,
    provideGreenHint: handleProvideGreenHint,
  };
}