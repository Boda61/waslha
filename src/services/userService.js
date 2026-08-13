import { supabase } from '../lib/firebase.js';
import { friendlyError } from '../utils/helpers.js';

// Update display username (validated for uniqueness by the server-side RPC).
export async function updateUsername(username) {
  const { data, error } = await supabase.rpc('update_username', {
    p_username: (username || '').trim(),
  });

  if (error) {
    throw new Error(friendlyError(error, 'مش قدرنا نغيّر الاسم.'));
  }
  return data;
}

// Update avatar only (harmless, safe to store directly).
export async function updateAvatar(avatar) {
  const { data, error } = await supabase.rpc('update_avatar', {
    p_avatar: (avatar || '🦁').toString().slice(0, 4),
  });

  if (error) {
    throw new Error(friendlyError(error, 'مش قدرنا نغيّر الصورة.'));
  }
  return data;
}
