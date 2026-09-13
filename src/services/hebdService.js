import { supabase } from '../lib/Supabase.js';
import { friendlyError, camelcaseKeys } from '../utils/helpers.js';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Waslha — Hebd Mode (هبد في هبد) service layer                          │
// │  Every mutation goes through the existing server RPCs.                  │
// │  The client NEVER writes to hebd_* tables directly.                     │
// └─────────────────────────────────────────────────────────────────────────┘

// ── Public catalog ─────────────────────────────────────────────────────────
// Active categories only (RLS allows authenticated users to read active rows).
export async function listHebdCategories() {
  const { data, error } = await supabase
    .from('hebd_categories')
    .select('id, name, emoji, description')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(friendlyError(error, 'مش قدرنا نجيب الفئات.'));
  return camelcaseKeys(data || []);
}

// ── Match + lobby RPCs ──────────────────────────────────────────────────────

// Atomic room + match + category order creation.
export async function createHebdRoom(totalRounds, categoryIds) {
  const { data, error } = await supabase.rpc('create_hebd_room', {
    p_total_rounds: totalRounds,
    p_categories: categoryIds,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نعمل الماتش.'));
  return camelcaseKeys(data?.[0]);
}

// Read-only probe: is there a room with this code, and in which mode?
// Used to give a clear "wrong code" / "wrong mode" message before joining.
export async function getRoomMode(code) {
  const { data, error } = await supabase.rpc('get_room_mode', { p_code: code });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نتأكد من الكود.'));
  return data?.[0]?.mode ?? null;
}

// Join an open Hebd lobby (max 2 players, server-enforced).
export async function joinHebdRoom(code) {
  const { data, error } = await supabase.rpc('join_hebd_room', { p_code: code });
  if (error) throw new Error(friendlyError(error, 'الكود ده مش صحيح أو الغرفة مش متاحة.'));
  return camelcaseKeys(data?.[0]);
}

// Server toggles ONLY the caller's own readiness.
export async function setHebdReady(roomId, ready) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('set_hebd_ready', {
    p_room_id: roomId,
    p_ready: ready,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نحدّث الحالة.'));
  return data?.[0]?.ok ?? false;
}

// Host-only start; creates round 1 atomically on the server.
export async function startHebdMatch(roomId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('start_hebd_match', { p_room_id: roomId });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نبدأ اللعبة.'));
  return data?.[0]?.ok ?? false;
}

// ── Gameplay RPCs ───────────────────────────────────────────────────────────

// Guesser guesses; the SERVER decides correctness. Reveals on a hit.
export async function submitHebdGuess(roomId, guess) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const clean = (guess || '').trim();
  if (!clean) throw new Error('اكتب تخمين الأول.');
  if (clean.length > 100) throw new Error('التخمين طويل أوي (الحد 100 حرف).');

  const { data, error } = await supabase.rpc('submit_hebd_guess', {
    p_room_id: roomId,
    p_guess: clean,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نسجّل التخمين.'));
  return camelcaseKeys(data?.[0]);
}

// Revealed round -> next round, or end of match on the final round.
export async function nextHebdRound(roomId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('next_hebd_round', { p_room_id: roomId });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نبدأ الجولة الجاية.'));
  return camelcaseKeys(data?.[0]);
}

// Match row (hebd_matches): status transitions + current round.
// Falls back to an initial fetch so the lobby always renders with data.
export function subscribeHebdMatch(roomId, onData, onError) {
  if (!roomId) {
    onError?.(new Error('معرّف الغرفة مفقود.'));
    return () => {};
  }

  const channel = supabase
    .channel(`public:hebd_matches:room_id=eq.${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hebd_matches', filter: `room_id=eq.${roomId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onData(null);
        } else {
          onData(camelcaseKeys(payload.new));
        }
      },
    )
    .on('error', (err) => onError?.(err))
    .subscribe();

  supabase
    .from('hebd_matches')
    .select('*')
    .eq('room_id', roomId)
    .single()
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') {
        onError?.(error);
        return;
      }
      onData(camelcaseKeys(data));
    });

  return () => supabase.removeChannel(channel);
}

// Current round row (hebd_rounds): live status / answer / roles.
export function subscribeHebdRound(roomId, roundId, onData, onError) {
  if (!roundId) {
    onError?.(new Error('مفيش جولة حالية.'));
    return () => {};
  }

  const channel = supabase
    .channel(`public:hebd_rounds:id=${roundId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hebd_rounds', filter: `id=eq.${roundId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onData(null);
        } else {
          onData(camelcaseKeys(payload.new));
        }
      },
    )
    .on('error', (err) => onError?.(err))
    .subscribe();

  supabase
    .from('hebd_rounds')
    .select('*')
    .eq('id', roundId)
    .single()
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') {
        onError?.(error);
        return;
      }
      onData(camelcaseKeys(data));
    });

  return () => supabase.removeChannel(channel);
}


// Fetch several public items at once (both players' images for a round).
export async function fetchHebdItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return [];
  const { data, error } = await supabase
    .from('hebd_items')
    .select('id, image_emoji, image_url, difficulty')
    .in('id', itemIds);

  if (error) throw new Error(friendlyError(error, 'مش قدرنا نجيب العناصر.'));
  return camelcaseKeys(data || []);
}

// ── Cards RPCs ──────────────────────────────────────────────────────────────

// 🔴 Use Red Card (guesser only): creates 3 question slots
export async function callUseHebdRedCard(roomId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('use_hebd_red_card', {
    p_room_id: roomId,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نستخدم الكارت الأحمر.'));
  return camelcaseKeys(data?.[0]);
}

// 🔴 Submit a red-card question (guesser only)
export async function submitHebdRedQuestion(roomId, question) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const clean = (question || '').trim();
  if (!clean) throw new Error('اكتب السؤال الأول.');
  if (clean.length > 200) throw new Error('السؤال طويل أوي (الحد 200 حرف).');

  const { data, error } = await supabase.rpc('submit_hebd_red_question', {
    p_room_id: roomId,
    p_question: clean,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نبعت السؤال.'));
  return camelcaseKeys(data?.[0]);
}

// 🔴 Answer a red-card question (presenter only)
export async function answerHebdRedQuestion(roomId, answer) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const clean = (answer || '').trim();
  if (!clean) throw new Error('اكتب الإجابة الأول.');

  const { data, error } = await supabase.rpc('answer_hebd_red_question', {
    p_room_id: roomId,
    p_answer: clean,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نسجل الإجابة.'));
  return camelcaseKeys(data?.[0]);
}

// 🟢 Use Green Card (guesser only): request a hint from presenter
export async function callUseHebdGreenCard(roomId) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const { data, error } = await supabase.rpc('use_hebd_green_card', {
    p_room_id: roomId,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نستخدم الكارت الأخضر.'));
  return camelcaseKeys(data?.[0]);
}

// 🟢 Provide a green-card hint (presenter only)
export async function provideHebdGreenHint(roomId, hint) {
  if (!roomId) throw new Error('معرّف الغرفة مفقود.');
  const clean = (hint || '').trim();
  if (!clean) throw new Error('اكتب التلميح الأول.');
  if (clean.length > 200) throw new Error('التلميح طويل أوي (الحد 200 حرف).');

  const { data, error } = await supabase.rpc('provide_hebd_green_hint', {
    p_room_id: roomId,
    p_hint: clean,
  });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نبعت التلميح.'));
  return camelcaseKeys(data?.[0]);
}

// ── Card subscriptions ──────────────────────────────────────────────────────

// Subscribe to red-card questions for the current round
export function subscribeHebdRedCardQuestions(roomId, roundId, onData, onError) {
  if (!roundId) {
    onError?.(new Error('مفيش جولة حالية.'));
    return () => {};
  }

  const channel = supabase
    .channel(`public:hebd_red_card_questions:round_id=${roundId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hebd_red_card_questions', filter: `round_id=eq.${roundId}` },
      () => {
        // Re-fetch all questions on any change
        supabase
          .from('hebd_red_card_questions')
          .select('*')
          .eq('round_id', roundId)
          .order('question_number', { ascending: true })
          .then(({ data, error }) => {
            if (error) {
              onError?.(error);
              return;
            }
            onData(camelcaseKeys(data || []));
          });
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('hebd_red_card_questions')
    .select('*')
    .eq('round_id', roundId)
    .order('question_number', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        onError?.(error);
        return;
      }
      onData(camelcaseKeys(data || []));
    });

  return () => supabase.removeChannel(channel);
}

// Subscribe to green-card hints for the current round
export function subscribeHebdGreenCardHints(roomId, roundId, onData, onError) {
  if (!roundId) {
    onError?.(new Error('مفيش جولة حالية.'));
    return () => {};
  }

  const channel = supabase
    .channel(`public:hebd_green_card_hints:round_id=${roundId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hebd_green_card_hints', filter: `round_id=eq.${roundId}` },
      () => {
        supabase
          .from('hebd_green_card_hints')
          .select('*')
          .eq('round_id', roundId)
          .single()
          .then(({ data, error }) => {
            if (error && error.code !== 'PGRST116') {
              onError?.(error);
              return;
            }
            onData(camelcaseKeys(data));
          });
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('hebd_green_card_hints')
    .select('*')
    .eq('round_id', roundId)
    .single()
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') {
        onError?.(error);
        return;
      }
      onData(camelcaseKeys(data));
    });

  return () => supabase.removeChannel(channel);
}

// Subscribe to card usage (to track which cards were used)
export function subscribeHebdCardUses(roomId, onData, onError) {
  if (!roomId) {
    onError?.(new Error('معرّف الغرفة مفقود.'));
    return () => {};
  }

  const channel = supabase
    .channel(`public:hebd_card_uses:room_id=${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hebd_card_uses', filter: `room_id=eq.${roomId}` },
      () => {
        supabase
          .from('hebd_card_uses')
          .select('*')
          .eq('room_id', roomId)
          .then(({ data, error }) => {
            if (error) {
              onError?.(error);
              return;
            }
            onData(camelcaseKeys(data || []));
          });
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('hebd_card_uses')
    .select('*')
    .eq('room_id', roomId)
    .then(({ data, error }) => {
      if (error) {
        onError?.(error);
        return;
      }
      onData(camelcaseKeys(data || []));
    });

  return () => supabase.removeChannel(channel);
}