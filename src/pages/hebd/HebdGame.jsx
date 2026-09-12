import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import VoiceChatControls from '../../components/VoiceChatControls.jsx';
import useVoiceCall from '../../hooks/useVoiceCall.js';
import {
  submitHebdGuess,
  expireHebdRound,
  nextHebdRound,
} from '../../services/hebdService.js';

// Counts down to the authoritative ends_at. Never mutates DB state by
// itself — when it hits zero it asks the server via expire_hebd_round.
function useRoundCountdown(roomId, roundId, roundStatus, endsAtRaw, onExpire) {
  const [remaining, setRemaining] = useState(null);
  const firedAtZero = useRef(false);

  useEffect(() => {
    if (!roundId || roundStatus === 'revealed') {
      setRemaining(null);
      firedAtZero.current = false;
      return undefined;
    }
    const endsAtMs = endsAtRaw ? new Date(endsAtRaw).getTime() : null;
    if (!endsAtMs) return undefined;

    const tick = () => {
      const ms = endsAtMs - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [roundId, roundStatus, endsAtRaw]);

  // Fire the RPC exactly once per active round.
  useEffect(() => {
    if (!roomId || !roundId || roundStatus === 'revealed') {
      firedAtZero.current = false;
      return;
    }
    if (remaining === 0 && !firedAtZero.current) {
      firedAtZero.current = true;
      onExpire();
    }
  }, [roomId, roundId, roundStatus, remaining, onExpire]);

  return remaining;
}

function formatTime(secs) {
  if (secs === null || secs === undefined) return '--';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const DIFFICULTY_COLORS = {
  سهل: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/30',
  متوسط: 'text-amber-300 bg-amber-500/10 ring-amber-400/30',
  صعب: 'text-rose-300 bg-rose-500/10 ring-rose-400/30',
};

export default function HebdGame({ room, players, match, round, item, myPlayer, onLeave }) {
  const navigate = useNavigate();
  const { push } = useToast();

  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const myUserId = myPlayer?.userId;
  const roomId = room?.id;
  const isPresenter = !!round && round.presenterId === myUserId;
  const isGuesser = !!round && round.guesserId === myUserId;
  const revealed = !!round && round.status === 'revealed';
  const matchEnded = !!match && match.status === 'ended';

  // Live voice chat with the other player (WebRTC + Realtime signaling).
  const peerPlayer = players.find((p) => p.userId !== myUserId) || null;
  const peerUserId = peerPlayer?.userId || null;
  const voice = useVoiceCall({
    enabled: !!roomId && !matchEnded,
    roomId: roomId || null,
    myUserId: myUserId || null,
    peerUserId,
    onError: (msg) => push(msg, 'error'),
  });

  const handleExpire = useCallback(async () => {
    if (!roomId) return;
    try {
      await expireHebdRound(roomId);
    } catch (err) {
      console.error('expire_hebd_round error:', err);
      // Idempotent + non-blocking: realtime will settle the state anyway.
    }
  }, [roomId]);

  const remaining = useRoundCountdown(
    roomId,
    round?.id,
    round?.status,
    round?.endsAt,
    handleExpire,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomId || submitting || !guess.trim()) return;
    setSubmitting(true);
    try {
      const res = await submitHebdGuess(roomId, guess);
      if (res && !res.isCorrect) {
        // Wrong guess — round stays open, user may try again.
        setGuess('');
        push('غلط 😅 جرب تاني', 'info');
      }
      // On a correct guess the server reveals the round; the realtime
      // subscription flips the UI to the revealed screen automatically.
    } catch (err) {
      console.error('submit_hebd_guess error:', err);
      push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (!roomId || advancing) return;
    setAdvancing(true);
    try {
      await nextHebdRound(roomId);
      // Server creates the next round or ends the match — realtime handles UI.
    } catch (err) {
      console.error('next_hebd_round error:', err);
      push(err.message, 'error');
      setAdvancing(false);
    }
  };

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await onLeave?.();
    } catch (err) {
      console.error('leave_hebd error:', err);
      setLeaving(false);
    }
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const aHost = a.userId === room?.hostId ? 0 : 1;
    const bHost = b.userId === room?.hostId ? 0 : 1;
    return aHost - bHost;
  });

  const renderPlayerCard = (player, role) => {
    if (!player) return null; // players may not have arrived yet
    const isMe = player.userId === myUserId;
    const isOnTurn = role === 'guesser';
    return (
      <div
        className={`glass rounded-2xl border-2 p-4 transition ${
          isOnTurn ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/10'
        } ${isMe ? 'ring-1 ring-white/20' : ''}`}
      >
        <div className="flex items-center gap-3">
          <Avatar avatar={player.avatar} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-white">
              {player.username}
              {isMe && <span className="mr-1 text-sm text-brand-300">(انت)</span>}
            </p>
            <p className={`text-xs font-bold ${isOnTurn ? 'text-brand-300' : 'text-slate-400'}`}>
              {isOnTurn ? 'دوره يخمّن 🎯' : 'مش دوره دلوقتي'}
            </p>
          </div>
          <div className="text-left">
            <p className="text-xl font-black text-white">{player.score}</p>
            <p className="text-[10px] text-slate-500">نقطة</p>
          </div>
        </div>
        <span className="mt-3 inline-block rounded-lg bg-night-700 px-2 py-0.5 text-[11px] font-bold text-slate-300">
          {role === 'presenter' ? '🎤 العارض' : '🔎 المخمّن'}
        </span>
      </div>
    );
  };

  // ── Match ended ───────────────────────────────────────────────────────────
  if (matchEnded || room?.status === 'ended') {
    const winner = players.find((p) => p.userId === match?.winnerUserId) || null;
    const winnerName = match?.winnerName || winner?.username || 'لاعب';
    const meWon = myUserId === match?.winnerUserId;
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="animate-pop glass rounded-3xl p-8 text-center">
          <span className="text-6xl">🏆</span>
          <h1 className="mt-3 text-3xl font-black text-white">انتهت اللعبة</h1>
          <p className="mt-2 text-lg font-bold text-gold-300">
            الفائز: {winnerName} {meWon ? '(انت! 🎉)' : ''}
          </p>

          <div className="mt-6 space-y-2">
            {sortedPlayers.map((p) => (
              <div
                key={p.userId}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="flex items-center gap-2 font-bold text-white">
                  <Avatar avatar={p.avatar} size="sm" />
                  {p.username}
                  {p.userId === match?.winnerUserId && ' 👑'}
                </span>
                <span className="text-lg font-black text-brand-300">{p.score} نقطة</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/hebd')}
            className="mt-8 w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400"
          >
            العب تاني 🎮
          </button>
        </div>
      </div>
    );
  }

  // ── Round missing (just started / transitioning) ─────────────────────────
  if (!round) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="animate-pulse text-5xl">🎲</span>
        <h1 className="mt-4 text-2xl font-black text-white">بنجهّز الجولة...</h1>
        <p className="mt-2 text-slate-400">اللاعبين بيتجهزوا واختيار العنصر بيحصل.</p>
      </div>
    );
  }

  const presenter = players.find((p) => p.userId === round?.presenterId);
  const guesser = players.find((p) => p.userId === round?.guesserId);
  const roundNumber = round?.roundNumber ?? match?.currentRound ?? '--';
  const totalRounds = match?.totalRounds ?? room?.maxPlayers;
  const difficultyClass = DIFFICULTY_COLORS[item?.difficulty] || DIFFICULTY_COLORS['سهل'];

  // Players subscription can lag a moment behind the round — wait for both.
  if (!presenter || !guesser) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="animate-pulse text-5xl">👥</span>
        <h1 className="mt-4 text-2xl font-black text-white">بنحضّر اللاعبين...</h1>
        <p className="mt-2 text-slate-400">استنى لحظة — العبين لسه بيوصّلوا.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="glass sticky top-16 z-30 flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
        <span className="rounded-lg bg-gold-500/15 px-2.5 py-1 text-sm font-black text-gold-300">
          الجولة {roundNumber} / {totalRounds}
        </span>
        <span className="text-sm font-bold text-slate-300">🎮 هبد في هبد</span>
        <span
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-black ${
            revealed
              ? 'bg-slate-500/15 text-slate-300'
              : remaining <= 10
                ? 'bg-rose-500/20 text-rose-300 animate-pulse'
                : 'bg-brand-500/15 text-brand-300'
          }`}
        >
          ⏱️ {formatTime(remaining)}
        </span>
      </div>

      {/* Players */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {renderPlayerCard(presenter, 'presenter')}
        {renderPlayerCard(guesser, 'guesser')}
      </div>

      {/* Voice chat */}
      <div className="mt-3">
        <VoiceChatControls
          status={voice.status}
          micOn={voice.micOn}
          remoteSpeaking={voice.remoteSpeaking}
          error={voice.error}
          peerName={peerPlayer?.username || 'اللاعب الآخر'}
          onStart={voice.startCall}
          onToggleMute={voice.toggleMute}
        />
      </div>

      {/* Round body */}
      <div className="mt-4">
        {revealed ? (
          <div className="animate-pop glass rounded-3xl p-6 text-center sm:p-8">
            <span className="text-5xl">{round.guesserWon ? '🎉' : '⏰'}</span>
            <h2 className="mt-2 text-2xl font-black text-white">
              {round.guesserWon ? 'عرفها المخمّن!' : 'الوقت خلص'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">الجواب الصحيح كان:</p>
            <p className="mt-2 text-3xl font-black text-brand-300">{round.answer}</p>
            {round.guesserWon && (
              <p className="mt-2 text-sm font-bold text-slate-300">
                {guesser?.username} كسب النقطة 🏅
              </p>
            )}
            <button
              onClick={handleNext}
              disabled={advancing}
              className="mt-6 w-full rounded-xl bg-gold-500 py-3 text-lg font-black text-night-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {advancing ? 'بنبدأ الجولة الجاية...' : 'الجولة الجاية ➡️'}
            </button>
          </div>
        ) : isGuesser ? (
          /* ── Guesser: guess form ── */
          <div className="glass rounded-3xl p-6 sm:p-8">
            <div className="text-center">
              <span className="text-4xl">🎯</span>
              <h2 className="mt-2 text-2xl font-black text-white">
                دورك يا {myPlayer?.username}!
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {presenter?.username} بيوصفلك حاجة — إيه رأيك؟
              </p>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <input
                autoFocus
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="اكتب تخمينك هنا..."
                maxLength={100}
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-4 text-center text-lg font-bold text-white outline-none transition focus:border-brand-400"
              />
              <button
                type="submit"
                disabled={submitting || !guess.trim() || remaining === 0}
                className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'بنحسب...' : 'تخمين 🔎'}
              </button>
            </form>
          </div>
        ) : isPresenter ? (
          /* ── Presenter: item to describe ── */
          <div className="glass rounded-3xl p-6 text-center sm:p-8">
            <span className="text-5xl">🎤</span>
            <h2 className="mt-2 text-2xl font-black text-white">دورك تعرض!</h2>
            <p className="mt-1 text-sm text-slate-400">
              وصف العنصر ده من غير ما تقول اسمه — والمخمّن لازم يعرف اسمه.
            </p>

            <div className="mx-auto mt-5 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/10 bg-night-800/40 p-6">
              {item?.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt="العنصر المطلوب وصفه"
                  className="max-h-48 w-auto rounded-xl object-contain"
                />
              ) : (
                <span className="text-6xl">{item?.imageEmoji || '🖼️'}</span>
              )}
              <span className={`rounded-lg px-2.5 py-1 text-xs font-black ring-1 ${difficultyClass}`}>
                {item?.difficulty || 'سهل'}
              </span>
            </div>

            <p className="mt-4 animate-pulse text-sm font-bold text-brand-300">
              في انتظار تخمين {guesser?.username}... ⏳
            </p>
          </div>
        ) : null}

        {/* Leave */}
        <button
          onClick={handleLeave}
          disabled={leaving}
          className="mx-auto mt-4 block rounded-xl border border-rose-500/40 px-6 py-2.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {leaving ? 'بنسيب اللعبة...' : 'خروج من اللعبة'}
        </button>
      </div>
    </div>
  );
}