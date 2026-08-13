import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.jsx';
import { register } from '../services/authService.js';
import { AVATARS } from '../utils/constants.js';

const GAMER_NAMES = ['الجوكر', 'الدنجل', 'الزعيم', 'الفارس', 'المايسترو', 'الصاروخ'];

export default function Register() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const suggestName = () => {
    const n = GAMER_NAMES[Math.floor(Math.random() * GAMER_NAMES.length)];
    const suffix = Math.floor(Math.random() * 99) + 10;
    setUsername(`${n}_${suffix}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password || !username.trim()) {
      setError('اكمل كل الخانات الأول.');
      return;
    }
    if (password.length < 6) {
      setError('كلمة السر لازم 6 حروف على الأقل.');
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, username: username.trim(), avatar });
    } catch (err) {
      setError(err.message || 'مش قدرنا نسجّل الحساب.');
      setLoading(false);
      return;
    }
    push('اتفضل، اتسجلت بنجاح 🎉', 'success');
    navigate('/');
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8">
        <h1 className="text-center text-3xl font-black text-white">اعمل حساب</h1>
        <p className="mt-2 text-center text-sm text-slate-400">مجاناً وبلاش 🔥</p>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-300">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-300">
              الإيميل
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none transition focus:border-brand-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-slate-300">
              كلمة السر
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 حروف على الأقل"
              className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none transition focus:border-brand-400"
            />
          </div>
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-semibold text-slate-300">
              اسمك في اللعبة
            </label>
            <div className="flex gap-2">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اكتب اسم لعبك"
                className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none transition focus:border-brand-400"
              />
              <button
                type="button"
                onClick={suggestName}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xl transition hover:bg-white/10"
                title="اقترح اسم"
              >
                🎲
              </button>
            </div>
          </div>
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-300">اختار صورتك</span>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAvatar(a)}
                  className={`h-11 w-11 rounded-full text-2xl transition ${
                    avatar === a
                      ? 'bg-brand-500/30 ring-2 ring-brand-400'
                      : 'bg-night-800 hover:bg-night-700 ring-1 ring-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'بنضبط حسابك...' : 'سجّلني'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          معاك حساب؟{' '}
          <Link to="/login" className="font-bold text-brand-300 hover:underline">
            سجّل دخول
          </Link>
        </p>
      </div>
    </div>
  );
}
