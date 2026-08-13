import { supabase } from '../lib/firebase.js';
import { friendlyError, camelcaseKeys } from '../utils/helpers.js';

// ── Server-validated (RPC) actions ──────────────────────────────────────────

export async function createRoom(team) {
  const { data, error } = await supabase.rpc('create_room', { p_team: team });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نعمل الغرفة.'));
  return camelcaseKeys(data?.[0]);
}

export async function joinRoom(code) {
  const { data, error } = await supabase.rpc('join_room', { p_code: code });
  if (error) throw new Error(friendlyError(error, 'الكود ده مش صح أو الغرفة مش متاحة.'));
  return camelcaseKeys(data?.[0]);
}

export async function setTeam(roomId, team) {
  const { data, error } = await supabase.rpc('set_team', { p_room_id: roomId, p_team: team });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نغيّر الفريق.'));
  return camelcaseKeys(data?.[0]);
}

export async function setReady(roomId, ready) {
  const { data, error } = await supabase.rpc('set_ready', { p_room_id: roomId, p_ready: ready });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نحدّث الحالة.'));
  return camelcaseKeys(data?.[0]);
}

export async function leaveRoom(roomId) {
  const { error } = await supabase.rpc('leave_room', { p_room_id: roomId });
  if (error) throw new Error(friendlyError(error, 'مش قدرنا نخرج من الغرفة.'));
  return true;
}

// Online flag — clients write only their own row (RLS-enforced).
export async function setOnline(roomId, uid, online) {
  const { error } = await supabase
    .from('room_players')
    .update({ online })
    .eq('room_id', roomId)
    .eq('user_id', uid);

  if (error) throw new Error(friendlyError(error, 'مش قدرنا نحدّث الحالة.'));
}

// ── Realtime listeners ──────────────────────────────────────────────────────

// Room row realtime.
export function subscribeRoom(roomId, onData, onError) {
  const channel = supabase
    .channel(`public:rooms:id=${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
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

  // Initial fetch
  supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
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

// Players in a room realtime.
export function subscribePlayers(roomId, onData) {
  const channel = supabase
    .channel(`public:room_players:room_id=eq.${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => {
        supabase
          .from('room_players')
          .select('*')
          .eq('room_id', roomId)
          .order('joined_at', { ascending: true })
          .then(({ data }) => onData(camelcaseKeys(data) || []));
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })
    .then(({ data }) => onData(camelcaseKeys(data) || []));

  return () => supabase.removeChannel(channel);
}

// Single round realtime.
export function subscribeRound(roomId, roundId, onData) {
  if (!roundId) {
    onData(null);
    return () => {};
  }

  const channel = supabase
    .channel(`public:rounds:id=${roundId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onData(null);
        } else {
          onData(camelcaseKeys(payload.new));
        }
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .single()
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') return;
      onData(camelcaseKeys(data));
    });

  return () => supabase.removeChannel(channel);
}

// Public challenge data only (no secrets).
export function subscribeChallenge(challengeId, onData) {
  if (!challengeId) {
    onData(null);
    return () => {};
  }

  const channel = supabase
    .channel(`public:challenges:id=${challengeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` },
      (payload) => {
        onData(camelcaseKeys(payload.new));
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .single()
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') return;
      onData(camelcaseKeys(data));
    });

  return () => supabase.removeChannel(channel);
}

export { friendlyError };
