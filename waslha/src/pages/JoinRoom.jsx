import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.jsx';
import { joinRoom } from '../services/roomService.js';

export default function JoinRoom() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    setError('');
    if (!clean) {
      setError('اكتب كود الغرفة.');
      return;
    }
    setLoading(true);
    try {
      const data = await joinRoom(clean);
      push('دخلت الغرفة بنجاح 🎉', 'success');
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="glass rounded-3xl p-8 text-center">
        <h1 className="text-3xl font-black text-white">ادخل الغرفة بكود</h1>
        <p className="mt-2 text-sm text-slate-400">
          خد الكود من صاحبك واكتبه هنا.
        </p>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-300">
            {error}
          </p>
        )}

        <form onSubmit={handleJoin} className="mt-6 space-y-4">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="مثال: 8K3F"
            maxLength={6}
            className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-4 text-center text-3xl font-black tracking-[0.3em] text-white outline-none transition focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'بندخلك...' : 'دخول 🚪'}
          </button>
        </form>
      </div>
    </div>
  );
}
