import { useState } from 'react';

// The two secret images are rendered as visual cards (emoji + theme) so they
// are fully self-contained. Only the room leader sees them.
export default function LeaderPanel({ challenge, onClue, submitting, players, myUid, onMakeLeader }) {
  const [clue, setClue] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const canSubmit = clue.trim().length >= 2 && !submitting;

  const others = players.filter((p) => p.userId !== myUid);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onClue(clue.trim());
  };

  const imageCard = (emoji, label, grad) => (
    <div
      className={`lp-card flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 p-6 ${grad}`}
    >
      <span className="lp-emoji text-7xl drop-shadow-lg">{emoji}</span>
      <span className="text-sm font-semibold text-slate-300">{label}</span>
    </div>
  );

  return (
    <section className="animate-fade-up">
      <header className="mb-4 text-center">
        <p className="text-sm font-semibold text-gold-300">🕵️ انت القائد — شوف الصورتين السريتين</p>
        <h2 className="mt-1 text-2xl font-black text-white">{challenge.title}</h2>
        <p className="mt-1 text-sm text-slate-400">الفئة: {challenge.category} • صعوبة {challenge.difficulty}</p>
        <p className="mt-2 text-slate-500">الصورتين دول سرّيين — متوريحيش حد 💀</p>
      </header>

      <div className="lp-images grid grid-cols-2 gap-4">
        {imageCard(challenge.imageAEmoji, challenge.imageALabel, 'bg-gradient-to-br from-rose-500/20 to-orange-500/10')}
        {imageCard(challenge.imageBEmoji, challenge.imageBLabel, 'bg-gradient-to-br from-sky-500/20 to-indigo-500/10')}
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <label htmlFor="clue" className="mb-1 block text-sm font-bold text-slate-200">
          اكتب تلميحك لصور تمر بين الصورتين 🧠
        </label>
        <div className="lp-form-row flex gap-2">
          <input
            id="clue"
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            maxLength={40}
            placeholder="مثال: حاجة بتتباع في البيت..."
            className="lp-input w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none focus:border-gold-400"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="lp-submit shrink-0 rounded-xl bg-gold-500 px-5 font-black text-night-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '...' : 'ابعت التلميح 🔒'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          أول ما تبعت التلميح مفيش تعديل — الفريقين كلهم هيشوفوا 4 اختيارات ويتسابقوا.
        </p>
      </form>

      <div className="mt-6 rounded-2xl border border-white/10 bg-night-800/60 p-4">
        <button
          type="button"
          onClick={() => setShowTransfer((v) => !v)}
          className="text-sm font-bold text-gold-300 transition hover:text-gold-200"
        >
          سلّم القيادة 👑 {showTransfer ? '▲' : '▼'}
        </button>
        {showTransfer && (
          <div className="mt-3 space-y-2">
            {others.length === 0 && (
              <p className="text-xs text-slate-500">مفيش لاعبين تانيين في الغرفة.</p>
            )}
            {others.map((p) => (
              <button
                key={p.userId}
                type="button"
                onClick={() => onMakeLeader?.(p.userId)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-night-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-gold-400/40 hover:text-gold-200"
              >
                <span>
                  {p.username}{' '}
                  {p.team === 'red' ? '🔴' : p.team === 'blue' ? '🔵' : '⚪'}
                </span>
                <span className="text-xs text-gold-300">اجعلها قائدًا</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
