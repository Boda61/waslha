import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import VoiceChatControls from '../../components/VoiceChatControls.jsx';
import useVoiceCall from '../../hooks/useVoiceCall.js';
import { submitHebdGuess, nextHebdRound } from '../../services/hebdService.js';

const DIFFICULTY_COLORS = {
  سهل: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/30',
  متوسط: 'text-amber-300 bg-amber-500/10 ring-amber-400/30',
  صعب: 'text-rose-300 bg-rose-500/10 ring-rose-400/30',
};

export default function HebdGame({ room, players, match, round, itemsById, myPlayer, onLeave }) {
  const navigate = useNavigate();
  const { push } = useToast();

  const [guessOpen, setGuessOpen] = useState(false);
  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const myUserId = myPlayer?.userId;
  const roomId = room?.id;
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

  // ── Actions (server-authoritative — client never decides correctness) ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomId || submitting || !guess.trim()) return;
    setSubmitting(true);
    try {
      const res = await submitHebdGuess(roomId, guess);
      if (res && !res.isCorrect) {
        // Wrong guess — round stays open, everyone keeps talking.
        setGuess('');
        push('غلط 😅 الصورة لسه مكانها — حاول تاني', 'info');
      }
      // Correct guess → server reveals the round; realtime flips the UI.
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
      setGuessOpen(false);
      setGuess('');
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
  
  const roundNumber = round?.roundNumber ?? match?.currentRound ?? '--';
    const totalRounds = match?.totalRounds ?? '--';

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
                <span className="flex items-center gap-2 font-black text-white">
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

  // Players subscription can lag behind the round — wait for both.
  if (players.length < 2) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="animate-pulse text-5xl">👥</span>
        <h1 className="mt-4 text-2xl font-black text-white">بنحضّر اللاعبين...</h1>
        <p className="mt-2 text-slate-400">استنى لحظة — العبين لسه بيوصّلوا.</p>
      </div>
    );
  }

  const renderPlayerCard = (player, subtitle, showImage, item) => {
    if (!player) return null;
    const isMe = player.userId === myUserId;
    const itemDiffClass = DIFFICULTY_COLORS[item?.difficulty] || DIFFICULTY_COLORS['سهل'];
    return (
      <div
        className={`glass rounded-2xl border-2 p-4 transition ${
          isMe ? 'border-brand-400/60 bg-brand-500/10 ring-1 ring-white/20' : 'border-white/10'
        }`}
      >
        <div className="flex items-center gap-3">
          <Avatar avatar={player.avatar} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-white">
              {player.username}
              {isMe && <span className="mr-1 text-sm text-brand-300">(انت)</span>}
            </p>
            <p className="text-xs font-bold text-slate-400">{subtitle}</p>
          </div>
          <div className="text-left">
            <p className="text-xl font-black text-white">{player.score}</p>
            <p className="text-[10px] text-slate-500">نقطة</p>
          </div>
        </div>

        {/* Only the owner sees the real image; others see a locked placeholder */}
        {showImage ? (
          <div className="mt-3 mx-auto flex max-w-[180px] flex-col items-center gap-2 rounded-xl border border-white/10 bg-night-800/40 p-3">
            {item?.imageUrl ? (
              <img
                src={item.imageUrl}
                alt="العنصر الخاص بك"
                className="max-h-32 w-auto rounded-md object-contain"
              />
            ) : (
              <span className="text-4xl">{item?.imageEmoji || '🖼️'}</span>
            )}
            <span
              className={`rounded-lg px-2 py-0.5 text-[11px] font-black ring-1 ${itemDiffClass}`}
            >
              {item?.difficulty || 'سهل'}
            </span>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-night-800/40 p-6 text-center">
            <span className="text-3xl">🤫</span>
            <p className="mt-1 text-[11px] font-bold text-slate-400">صورته السرية</p>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header — no timer; rounds run until someone guesses */}
      <header className="glass sticky top-16 z-30 flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
        <span className="rounded-lg bg-gold-500/15 px-2.5 py-1 text-sm font-black text-gold-300">
          الجولة {roundNumber} / {totalRounds}
        </span>
        <span className="text-sm font-bold text-slate-300">🎮 هبد في هبد</span>
        <span
          className={`rounded-lg px-2.5 py-1 text-sm font-black ${
            revealed
              ? 'bg-slate-500/15 text-slate-300'
              : 'bg-brand-500/15 text-brand-300'
          }`}
        >
          {revealed ? '✅ الجواب كشف' : '🗣️ تواصل وخمن'}
        </span>
      </header>

      {/* Players — both see their own image */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        {sortedPlayers.map((p) =>
          renderPlayerCard(
            p,
            p.userId === round.presenterId ? '🎤 العارض' : '🔎 المخمّن',
            p.userId === myUserId,
            p.userId === round.presenterId ? itemsById?.[round.itemId] : itemsById?.[round.item2Id],
          ),
        )}
      </section>

      {/* Voice chat */}
      <section className="mt-3">
        <VoiceChatControls
          status={voice.status}
          micOn={voice.micOn}
          remoteSpeaking={voice.remoteSpeaking}
          error={voice.error}
          peerName={peerPlayer?.username || 'اللاعب الآخر'}
          onStart={voice.startCall}
          onToggleMute={voice.toggleMute}
        />
      </section>

      {/* Round body */}
      <section className="mt-4">
          {revealed ? (
          // ── Reveal / result ──
          <div className="animate-pop glass rounded-3xl p-6 text-center sm:p-8">
            <span className="text-5xl">{round.guesserWon ? '🎉' : '⏱️'}</span>
            <h2 className="mt-2 text-2xl font-black text-white">
              {round.guesserWon ? 'عرفها المخمّن!' : 'انتهت الجولة'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">الجواب الصحيح كان:</p>
            <p className="mt-2 text-3xl font-black text-brand-300">{round.answer}</p>
            {round.winnerUserId && (
              <p className="mt-2 text-sm font-bold text-slate-300">
                {players.find((p) => p.userId === round.winnerUserId)?.username || 'لاعب'}{' '}
                كسب النقطة 🏅
              </p>
            )}
            <button
              onClick={handleNext}
              disabled={advancing}
              className="mt-6 w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {advancing ? 'بنتحرك للجولة...' : 'الجولة الجاية ➡️'}
            </button>
          </div>
        ) : guessOpen ? (
          // ── My guess form ──
          <form onSubmit={handleSubmit} className="glass rounded-3xl p-6 sm:p-8">
            <h2 className="text-center text-2xl font-black text-white">اكتب تخمينك</h2>
            <p className="mt-1 text-center text-sm text-slate-400">
              اكتب إجابتك بالإنجليزية أو العربية — السيرفر بيتحقق.
            </p>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="تخمينك؟..."
                maxLength={100}
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-4 text-center text-lg font-bold text-white outline-none transition focus:border-brand-400"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || !guess.trim()}
                  className="flex-1 rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'بينحسب...' : 'تأكيد التخمين 🔍'}
                </button>
                <button
                  type="button"
                  onClick={() => setGuessOpen(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-night-700 py-3 text-lg font-black text-white transition hover:bg-night-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        ) : (
          // ── Active round (both have the button) ──
          <div className="glass rounded-3xl p-6 text-center sm:p-8">
            <span className="text-5xl">🗣️</span>
            <h2 className="mt-2 text-2xl font-black text-white">الدور نشط</h2>
            <p className="mt-1 text-sm text-slate-400">
              وصف الصورة وسألك — أو اخمن الآن.
            </p>
            <button
              onClick={() => setGuessOpen(true)}
              className="mt-5 rounded-xl bg-gold-500 px-6 py-3 text-lg font-black text-night-950 transition hover:bg-gold-400"
            >
              عايز أخمن
            </button>
          </div>
        )}

        {/* Leave */}
        <button
          onClick={handleLeave}
          disabled={leaving}
          className="mx-auto mt-4 block rounded-xl border border-rose-500/40 px-6 py-2.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {leaving ? 'بنسيب اللعبة...' : 'خروج من اللعبة'}
        </button>
      </section>
    </div>
  );
}