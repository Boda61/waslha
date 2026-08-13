import { supabase } from '../lib/firebase.js';
import { friendlyError, camelcaseKeys } from '../utils/helpers.js';
import { CHAT_LIMITS } from '../utils/constants.js';

// ── Realtime chat subscription (per round) ────────────────────────────────────
// RLS allows only active-team members to insert during clue_submitted.
export function subscribeMessages(roomId, roundId, onData) {
  if (!roundId) {
    onData([]);
    return () => {};
  }

  const channel = supabase
    .channel(`public:messages:round_id=eq.${roundId}`)
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

// Send a message. RLS enforces active-team + clue-submitted + length.
export async function sendMessage(roomId, roundId, sender, text) {
  const trimmed = String(text || '').trim().slice(0, CHAT_LIMITS.maxLength);
  if (!trimmed) return;

  const { error } = await supabase.from('messages').insert([{
    room_id: roomId,
    round_id: roundId,
    sender_id: sender.uid,
    sender_name: sender.username || 'لاعب',
    avatar: sender.avatar || '🦁',
    team: sender.team || null,
    text: trimmed,
  }]);

  if (error) throw new Error(friendlyError(error, 'مش قدرنا نرسل الرسالة.'));
}

export { friendlyError };
