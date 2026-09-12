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

// ── Realtime subscriptions ──────────────────────────────────────────────────

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