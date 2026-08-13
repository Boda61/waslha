import { Link, useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal.jsx';
import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext.jsx';
import { leaveRoom } from '../../services/roomService.js';

export default function GameOverModal({ room, players }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [leaving, setLeaving] = useState(false);

  const winner = room?.winner;
  const tie = winner === 'tie';

  const sortPlayers = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveRoom(room.id);
      navigate('/');
    } catch (err) {
      push(err.message, 'error');
      setLeaving(false);
      navigate('/');
    }
  };

  return (
    <Modal open>
      <div className="text-center">
        <span className="text-7xl">{tie ? '🤝' : '🏆'}</span>
        <h2 className="mt-2 text-4xl font-black text-white">
          {tie ? 'تعادل! وحشين' : room?.winnerName || 'لعبة خلصت'}
        </h2>
        <p className="mt-1 text-slate-300">{tie ? 'إيه العراك ده 😂' : 'كسبوا الجايزة الكبرى 🥇'}</p>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-night-800 text-slate-300">
              <tr>
                <th className="px-3 py-2 text-right">اللاعب</th>
                <th className="px-3 py-2">الفريق</th>
                <th className="px-3 py-2">النقاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortPlayers.map((p, i) => (
                <tr key={p.userId} className={i === 0 ? 'bg-gold-500/10' : ''}>
                  <td className="px-3 py-2 text-right">
                    <span className="ml-1">{i + 1 === 1 ? '🥇' : i + 1 === 2 ? '🥈' : i + 1 === 3 ? '🥉' : ''}</span>
                    {p.avatar} {p.username}
                  </td>
                  <td className="px-3 py-2">
                    {p.team === 'red' ? '🔴' : p.team === 'blue' ? '🔵' : '—'}
                  </td>
                  <td className="px-3 py-2 font-black">{p.score ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="rounded-xl bg-brand-500 px-6 py-3 font-black text-night-950 transition hover:bg-brand-400 disabled:opacity-50"
          >
            {leaving ? '...' : 'ارجع للرئيسية'}
          </button>
          <Link
            to="/create"
            className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-bold text-white transition hover:bg-white/10"
          >
            العب تاني 🔁
          </Link>
        </div>
      </div>
    </Modal>
  );
}
