import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { updateUsername, updateAvatar } from '../services/userService.js';
import { AVATARS } from '../utils/constants.js';

export default function Profile() {
  const { user, profile } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };
  const [username, setUsername] = useState(profile?.username || '');
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const saveName = async () => {
    if (!username.trim()) {
      push('اكتب اسم الأول.', 'error');
      return;
    }
    setSavingName(true);
    try {
      await updateUsername(username.trim());
      push('اتحدّث الاسم ✅', 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const saveAvatar = async (a) => {
    setSavingAvatar(true);
    try {
      await updateAvatar(a);
      push('اتحدّثت الصورة ✅', 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSavingAvatar(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-4 flex justify-start">
        <button
          onClick={goBack}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-night-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-night-700 hover:text-white"
        >
          <span className="text-lg leading-none">→</span>
          رجوع
        </button>
      </div>
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-3xl font-black text-white">بروفايلك</h1>
        <p className="mt-1 text-sm text-slate-400">{user?.email}</p>

        <div className="mt-6 flex justify-center">
          <Avatar avatar={profile.avatar} size="lg" />
        </div>

        <div className="mt-6 space-y-4 text-right">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-300">اسم اللعب</label>
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none focus:border-brand-400"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="shrink-0 rounded-xl bg-brand-500 px-5 font-bold text-night-950 transition hover:bg-brand-400 disabled:opacity-60"
              >
                {savingName ? '...' : 'حفظ'}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-300">غيّر صورتك</span>
            <div className="flex flex-wrap justify-center gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => saveAvatar(a)}
                  disabled={savingAvatar}
                  className={`h-11 w-11 rounded-full text-2xl transition ${
                    profile.avatar === a
                      ? 'bg-brand-500/30 ring-2 ring-brand-400'
                      : 'bg-night-800 ring-1 ring-white/10 hover:bg-night-700'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-night-800 p-4">
            <div>
              <p className="text-xs text-slate-400">إجمالي الألعاب</p>
              <p className="text-2xl font-black text-white">{profile?.games_played ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">مرات الفوز</p>
              <p className="text-2xl font-black text-gold-300">{profile?.wins ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
