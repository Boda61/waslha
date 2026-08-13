import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.jsx';
import { login } from '../services/authService.js';
import { friendlyError } from '../utils/helpers.js';

export default function Login() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('اكتب الإيميل وكلمة السر.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(friendlyError(err, 'مش قدرنا ندخلك. اتأكد من البيانات.'));
      setLoading(false);
      return;
    }
    push('أهلاً بيك تاني 🎉', 'success');
    navigate('/');
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8">
        <h1 className="text-center text-3xl font-black text-white">تسجيل دخول</h1>
        <p className="mt-2 text-center text-sm text-slate-400">ارجع وجاوب 😎</p>

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
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none transition focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'بنوصلك...' : 'دخول'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          معندكش حساب؟{' '}
          <Link to="/register" className="font-bold text-brand-300 hover:underline">
            سجّل مجاناً
          </Link>
        </p>
      </div>
    </div>
  );
}
