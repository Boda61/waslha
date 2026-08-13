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
  return camelcaseKeys(data?.[0]);
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
