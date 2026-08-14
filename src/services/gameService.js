import { supabase } from '../lib/firebase.js';
import { friendlyError, camelcaseKeys } from '../utils/helpers.js';

// ── Server-validated (RPC) game actions ─────────────────────────────────────

export async function startGame(roomId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('start_game', { p_room_id: roomId });
  if (error) throw new Error(friendlyError(error, 'مش قادرين نبدأ اللعبة.'));
  return camelcaseKeys(data?.[0]);
}

export async function submitClue(roomId, roundId, clue) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  if (!roundId) throw new Error('معرّف الجولة مفقود.');
  const { data, error } = await supabase.rpc('submit_clue', {
    p_room_id: roomId,
    p_round_id: roundId,
    p_clue: clue,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نرسل التلميح.'));
  return camelcaseKeys(data?.[0]);
}

export async function submitAnswer(roomId, roundId, choiceIndex) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  if (!roundId) throw new Error('معرّف الجولة مفقود.');
  const { data, error } = await supabase.rpc('submit_answer', {
    p_room_id: roomId,
    p_round_id: roundId,
    p_choice_index: choiceIndex,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نسجّل الإجابة.'));
  // submit_answer returns a jsonb object (not a table row), so `data` is the object.
  return camelcaseKeys(data);
}

// Realtime listener for the current round's recorded answers (both teams).
// Members can read their room's attempts (RLS), so the UI can confirm a
// submission or a wrong answer straight from the database.
export function subscribeRoundAnswers(roundId, onData) {
  if (!roundId) {
    onData([]);
    return () => {};
  }

  const channel = supabase
    .channel(`public:round_answers:round_id=eq.${roundId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'round_answers',
        filter: `round_id=eq.${roundId}`,
      },
      () => {
        supabase
          .from('round_answers')
          .select('*')
          .eq('round_id', roundId)
          .then(({ data }) => onData(camelcaseKeys(data) || []));
      },
    )
    .subscribe();

  supabase
    .from('round_answers')
    .select('*')
    .eq('round_id', roundId)
    .then(({ data }) => onData(camelcaseKeys(data) || []));

  return () => supabase.removeChannel(channel);
}

export async function submitPrediction(roomId, roundId, choiceIndex) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  if (!roundId) throw new Error('معرّف الجولة مفقود.');
  const { data, error } = await supabase.rpc('submit_prediction', {
    p_room_id: roomId,
    p_round_id: roundId,
    p_choice_index: choiceIndex,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نسجّل التوقع.'));
  return camelcaseKeys(data?.[0]);
}

// Authoritative server-side timer expiration.
// Any room member may call it; it only succeeds when the persisted
// deadline has actually passed, then it advances the game.
export async function expireRound(roomId, roundId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  if (!roundId) throw new Error('معرّف الجولة مفقود.');
  const { data, error } = await supabase.rpc('expire_round', {
    p_room_id: roomId,
    p_round_id: roundId,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا ننهي الجولة.'));
  return camelcaseKeys(data?.[0]);
}

// Host triggers the next round after the result countdown.
export async function nextRound(roomId, roundId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  if (!roundId) throw new Error('معرّف الجولة مفقود.');
  const { error } = await supabase.rpc('next_round', {
    p_room_id: roomId,
    p_round_id: roundId,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نبدأ الجولة الجاية.'));
  return true;
}

// ── Realtime listener for current-round predictions ─────────────────────────

export function subscribePredictions(roomId, roundId, onData) {
  if (!roundId) {
    onData([]);
    return () => {};
  }

  const channel = supabase
    .channel(`public:predictions:round_id=eq.${roundId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'predictions',
        filter: `round_id=eq.${roundId}`,
      },
      () => {
        supabase
          .from('predictions')
          .select('*')
          .eq('round_id', roundId)
          .then(({ data }) => onData(camelcaseKeys(data) || []));
      },
    )
    .subscribe();

  supabase
    .from('predictions')
    .select('*')
    .eq('round_id', roundId)
    .then(({ data }) => onData(camelcaseKeys(data) || []));

  return () => supabase.removeChannel(channel);
}

export { friendlyError };