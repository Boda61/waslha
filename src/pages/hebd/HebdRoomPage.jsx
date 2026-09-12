import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HebdLobby from './HebdLobby.jsx';
import { subscribeRoom, subscribePlayers, leaveRoom } from '../../services/roomService.js';
import { subscribeHebdMatch, setHebdReady, startHebdMatch } from '../../services/hebdService.js';

export default function HebdRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState('');

  // Realtime subscriptions: room row + players + hebd match state.
  useEffect(() => {
    if (!roomId) {
      setNotFound(true);
      return undefined;
    }

    const unsubRoom = subscribeRoom(
      roomId,
      (r) => {
        if (!r) {
          setNotFound(true);
          return;
        }
        setRoom(r);
        // This page is Hebd-only — wrong mode = treat as not found.
        if (r.mode !== 'hebd') setNotFound(true);
      },
      () => setNotFound(true),
    );
    const unsubPlayers = subscribePlayers(roomId, setPlayers);
    const unsubMatch = subscribeHebdMatch(
      roomId,
      () => {},
      (err) => console.error('hebd_matches subscription error:', err),
    );

    return () => {
      unsubRoom();
      unsubPlayers();
      unsubMatch();
    };
  }, [roomId]);

  const myUserId = user?.id;
  const myPlayer = myUserId ? players.find((p) => p.userId === myUserId) : null;
  const isHost = !!room && room.hostId === myUserId;

  const handleSetReady = useCallback(async () => {
    if (!roomId || !myPlayer || busy === 'ready') return;
    setBusy('ready');
    try {
      await setHebdReady(roomId, !myPlayer.isReady);
    } catch (err) {
      console.error('set_hebd_ready error:', err);
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  }, [roomId, myPlayer, busy, push]);

  const handleStart = useCallback(async () => {
    if (!roomId || busy === 'start') return;
    setBusy('start');
    try {
      await startHebdMatch(roomId);
      push('بدأت اللعبة! 🎉', 'success');
    } catch (err) {
      console.error('start_hebd_match error:', err);
      push(err.message, 'error');
      setBusy('');
    }
  }, [roomId, busy, push]);

  const handleLeave = useCallback(async () => {
    if (!roomId || busy === 'leave') return;
    setBusy('leave');
    try {
      await leaveRoom(roomId);
      navigate('/hebd');
    } catch (err) {
      console.error('leave_room error:', err);
      push(err.message, 'error');
      setBusy('');
    }
  }, [roomId, busy, push, navigate]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">🚪</span>
        <h1 className="mt-4 text-2xl font-black text-white">الغرفة دي مش موجودة</h1>
        <p className="mt-2 text-slate-400">يمكن الغرفة خلصت أو اتلغت أو مش مود هيبد.</p>
        <button
          onClick={() => navigate('/hebd')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ارجع لهبد في هبد
        </button>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">❌</span>
        <h1 className="mt-4 text-2xl font-black text-white">معرّف اللعبة غير صحيح</h1>
        <p className="mt-2 text-slate-400">الرابط ده ناقص أو غلط.</p>
        <button
          onClick={() => navigate('/hebd')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ارجع لهبد في هبد
        </button>
      </div>
    );
  }

  if (!room) return <LoadingScreen label="بنفتح اللعبة..." />;

  if (!myPlayer) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">🔒</span>
        <h1 className="mt-4 text-2xl font-black text-white">أنت مش في اللعبة دي</h1>
        <p className="mt-2 text-slate-400">اللعبة دي لأعضائها بس — ادخل بالكود أو اعمل لعبة جديدة.</p>
        <button
          onClick={() => navigate('/hebd')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ادخل أو اعمل لعبة
        </button>
      </div>
    );
  }

  // Playing / ended — the game screen ships in a later phase.
  // We only ever render it after the realtime update arrives, and the
  // server-controlled status is the single source of truth here.
  if (room.status !== 'lobby') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">🎮</span>
        <h1 className="mt-4 text-2xl font-black text-white">
          {room.status === 'playing' ? 'اللعبة بدأت!' : 'اللعبة خلصت'}
        </h1>
        <p className="mt-2 leading-relaxed text-slate-400">
          {room.status === 'playing'
            ? 'شاشة اللعب بتاعة هبد في هبد جاية في التحديث الجاي — استنى علينا 🌚'
            : 'الماتش خلص — شاشة النتائج جاية قريب.'}
        </p>
        <button
          onClick={() => navigate('/hebd')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ارجع لهبد في هبد
        </button>
      </div>
    );
  }

  return (
    <HebdLobby
      room={room}
      players={players}
      myUserId={myUserId}
      isHost={isHost}
      busy={busy}
      onSetReady={handleSetReady}
      onStart={handleStart}
      onLeave={handleLeave}
    />
  );
}