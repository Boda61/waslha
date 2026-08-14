import { supabase } from '../lib/firebase.js';
import { friendlyError, camelcaseKeys } from '../utils/helpers.js';
import { CHAT_LIMITS } from '../utils/constants.js';

// ── Realtime chat subscription (per round) ────────────────────────────────────
// RLS: any room member may insert during the answer race (clue_submitted),
// so both teams discuss the hint together in real time.
export function subscribeMessages(roomId, roundId, onData) {
  if (!roundId) {
    onData([]);
    return () => {};
  }

  const channelName = `public:messages:round_id=eq.${roundId}`;
  const topic = `realtime:${channelName}`;

  // Defensive: if a channel with the same name already exists (remount,
  // double-effect, or a second subscriber), remove it first. Otherwise
  // supabase-js throws "cannot add postgres_changes callbacks ... after subscribe()".
  supabase
    .getChannels()
    .filter((c) => c.topic === topic)
    .forEach((c) => supabase.removeChannel(c));

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `round_id=eq.${roundId}`,
      },
      (payload) => {
        onData((prev) => [...prev, camelcaseKeys(payload.new)]);
      },
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('messages')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })
    .then(({ data }) => onData(camelcaseKeys(data) || []));

  return () => supabase.removeChannel(channel);
}

// Send a message. RLS enforces membership + answer race + length.
export async function sendMessage(roomId, roundId, sender, text) {
  const trimmed = String(text || '').trim().slice(0, CHAT_LIMITS.maxLength);
  if (!trimmed) return;

  const { error } = await supabase.from('messages').insert([{
    room_id: roomId,
    round_id: roundId,
    sender_id: sender.userId,
    sender_name: sender.username || 'لاعب',
    avatar: sender.avatar || '🦁',
    team: sender.team || null,
    text: trimmed,
  }]);

  if (error) throw new Error(friendlyError(error, 'مش قدرنا نرسل الرسالة.'));
}

export { friendlyError };
