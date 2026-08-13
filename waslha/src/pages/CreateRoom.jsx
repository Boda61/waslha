import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { createRoom } from '../services/roomService.js';
import { MAX_PLAYERS } from '../utils/constants.js';
import TeamBadge from '../components/TeamBadge.jsx';

export default function CreateRoom() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [team, setTeam] = useState('red');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!profile) return;
    setError('');
    setLoading(true);
    try {
      const data = await createRoom(team);
      push('تمام، اتخلقت الغرفة 🎉', 'success');
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-3xl font-black text-white">اعمل غرفة جديدة</h1>
        <p className="mt-2 text-sm text-slate-400">
          انت هتبقى صاحب الغرفة (الـHost)، وحتى {MAX_PLAYERS} لاعب يقدر يلعب.
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-slate-300">
            اختار فريقك الأول
          </span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTeam('red')}
              className={`rounded-2xl border-2 p-5 transition ${
                team === 'red'
                  ? 'border-rose-400 bg-rose-500/20'
                  : 'border-white/10 bg-night-800 hover:bg-night-700'
              }`}
            >
              <TeamBadge teamId="red" />
            </button>
            <button
              onClick={() => setTeam('blue')}
              className={`rounded-2xl border-2 p-5 transition ${
                team === 'blue'
                  ? 'border-sky-400 bg-sky-500/20'
                  : 'border-white/10 bg-night-800 hover:bg-night-700'
              }`}
            >
              <TeamBadge teamId="blue" />
            </button>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'بنعمل الغرفة...' : 'اعمل الغرفة 🚀'}
        </button>
      </div>
    </div>
  );
}
