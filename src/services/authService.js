import { supabase } from '../lib/firebase.js';
import { friendlyError } from '../utils/helpers.js';

// Registers an email/password user with Supabase Auth, then creates a secure
// profile via the `register_profile` RPC (which guarantees username uniqueness).
export async function register({ email, password, username, avatar }) {
  const cleanUsername = (username || '').trim();
  const cleanAvatar = (avatar || '🦁').toString().slice(0, 4);

  // 1) Create the auth user.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Store display info so the trigger / profile can read it.
      data: { username: cleanUsername, avatar: cleanAvatar },
      email_redirect: false, // we don't need email confirmation to play locally
    },
  });

  if (signUpError) {
    throw new Error(friendlyError(signUpError, 'مش قادرين نسجّل الحساب دلوقتي.'));
  }

  const user = authData?.user;
  if (!user) {
    throw new Error('مش قدرنا نسجل الكود. جرب تاني.');
  }

  // 2) Create the profile row via RPC (server-side uniqueness check / avatar handling).
  const { data, error: rpcError } = await supabase.rpc('register_profile', {
    p_username: cleanUsername,
    p_avatar: cleanAvatar,
  });

  if (rpcError) {
    // Clean up the orphaned auth user so the player can retry without a stale account.
    try {
      await supabase.auth.admin.deleteUser(user.id);
    } catch {
      /* best-effort */
    }
    throw new Error(friendlyError(rpcError, 'مش قدرنا نسجل البروفايل. جرب اسم تاني.'));
  }

  return { user, profile: data };
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(friendlyError(error, 'مش قدرنا ندخلك. اتأكد من البيانات.'));
  }
  return { data };
}

export default { register, login };
