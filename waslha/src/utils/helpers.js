import { TEAMS } from './constants.js';

// Map a team id to Tailwind color set for consistent theming.
export function teamTheme(teamId) {
  return (
    TEAMS[teamId] || {
      color: 'slate',
      name: 'مش معين',
      emoji: '⚪',
    }
  );
}

// Friendly Arabic errors (also covers Supabase Postgres error codes).
export function friendlyError(err, fallback = 'حصلت مشكلة. حاول تاني.') {
  if (!err) return fallback;
  const msg = err.message || '';
  const code = err.code || '';
  const details = err.details || '';

  const map = [
    // Supabase Auth
    ['User already registered', 'الإيميل ده مسجل قبل كده. سجّل دخول بدل ما تعمل حساب.'],
    ['auth/email-already-in-use', 'الإيميل ده مسجل قبل كده. سجّل دخول بدل ما تعمل حساب.'],
    ['email', 'الإيميل ده مسجل قبل كده. سجّل دخول بدل ما تعمل حساب.'],
    ['invalid email', 'الإيميل ده مش صح.'],
    ['invalid-email', 'الإيميل ده مش صح.'],
    ['Auth not enabled', 'الحساب غير مفعّل أو كلمة السر غلط.'],
    ['user-not-found', 'مفيش حساب بالإيميل ده.'],
    ['wrong-password', 'كلمة السر غلط.'],
    ['too-many-requests', 'مفيش شكلك بتجرب كتير. استنى شوية وسجل تاني.'],
    ['network-request-failed', 'مفيش نت. اتأكد من اتصالك.'],
    ['weak password', 'كلمة السر ضعيفة. لازم 6 حروف على الأقل.'],
    ['weak-password', 'كلمة السر ضعيفة. لازم 6 حروف على الأقل.'],
    // Supabase DB / RPC
    ['23505', 'القيمة دي متكررة. جرب اسم تاني.'],
    ['PGRST116', 'البيانات مش موجودة.'],
    ['PGRST100', 'مفيش صلاحية كده.'],
    ['PGRST117', 'مفيش صلاحية كده.'],
    ['permission-denied', 'مفيش صلاحية كده.'],
    ['unauthenticated', 'لازم تسجل دخول الأول.'],
    ['P0001', details || msg],
    ['23507', 'بيانات مرتبطة بجدول تاني، مش قادر تمسحها دلوقتي.'],
    // Generic network
    ['network', 'مفيش نت. اتأكد من اتصالك.'],
  ];

  for (const [token, arabic] of map) {
    if (msg.includes(token) || code.includes(token) || details.includes(token)) {
      return arabic;
    }
  }
  return fallback;
}

// Backward-compatible helper — returns the same friendly message.
export function extractFnError(err, fallback) {
  return friendlyError(err, fallback);
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `${minutes} د`;
  return `${Math.floor(minutes / 60)} س`;
}

export function toMillis(ts) {
  if (!ts) return null;
  // Supabase returns ISO strings; Firestore returns {seconds}.
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return new Date(ts).getTime();
}

// Convert a snake_case row from Supabase into the camelCase shape the existing
// UI expects (e.g. host_id -> hostId, red_score -> redScore).
// Only shallow-flat objects; arrays are mapped element-wise.
export function camelcaseKeys(row) {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(camelcaseKeys);
  if (typeof row !== 'object') return row;

  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}
