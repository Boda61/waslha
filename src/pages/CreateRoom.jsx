import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { createRoom } from '../services/roomService.js';
import { MAX_PLAYERS, GAME_MODES } from '../utils/constants.js';

export default function CreateRoom() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [mode, setMode] = useState('teams');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!profile) return;
    setError('');
    setLoading(true);
    try {
      const data = await createRoom(mode);
      push('تمام، اتخلقت الغرفة 🎉', 'success');
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white">اعمل غرفة جديدة</h1>
          <p className="mt-2 text-sm text-slate-400">
            انت هتبقى القائد 🕵️ — هتشوف الصورتين السريتين وتكتب التلميح. اختار
            طريقة اللعب الأول:
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Object.values(GAME_MODES).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`rounded-2xl border-2 p-4 text-center transition ${
                mode === m.id
                  ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-400/40'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <span className="text-3xl">{m.emoji}</span>
              <p className="mt-2 text-lg font-black text-white">{m.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{m.desc}</p>
              {mode === m.id && (
                <p className="mt-2 text-xs font-bold text-brand-300">مختار ✓</p>
              )}
            </button>
          ))}
        </div>

        <p className="mt-4 rounded-xl bg-night-800/60 px-4 py-3 text-center text-xs text-slate-400">
          في المودين القائد بره اللعب — بيشوف الصورتين وبيكتب التلميح، والبقية
          بيتسابقوا. وحتى {MAX_PLAYERS} لاعب يقدر يلعب.
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'بنعمل الغرفة...' : `اعمل الغرفة (${GAME_MODES[mode].shortName}) 🚀`}
        </button>
      </div>
    </div>
  );
}
