import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Navbar() {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="navbar glass sticky top-0 z-40 border-b border-white/5">
      <div className="navbar-inner mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-black text-white">
          <span className="text-2xl">🎮</span>
          وصلها
        </Link>

        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                <span className="text-xl">{profile?.avatar || '🦁'}</span>
                <span className="hidden sm:inline">{profile?.username || 'لاعب'}</span>
              </Link>
              <Link
                to="/"
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-night-950 transition hover:bg-brand-400"
              >
                العب
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
              >
                خروج
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                دخول
              </Link>
              <Link
                to="/register"
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-night-950 transition hover:bg-brand-400"
              >
                سجّل مجاناً
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
