import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { createRoom } from '../services/roomService.js';
import { MAX_PLAYERS } from '../utils/constants.js';

export default function CreateRoom() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!profile) return;
    setError('');
    setLoading(true);
    try {
      const data = await createRoom();
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
          انت هتبقى القائد 🕵️ — هتشوف الصورتين السريتين وتكتب التلميح، وفريقك بيتسابق.
          وحتى {MAX_PLAYERS} لاعب يقدر يلعب.
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
          {loading ? 'بنعمل الغرفة...' : 'اعمل الغرفة 🚀'}
        </button>
      </div>
    </div>
  );
}
