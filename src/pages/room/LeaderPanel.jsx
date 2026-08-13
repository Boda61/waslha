import { useState } from 'react';

// The two secret images are rendered as visual cards (emoji + theme) so they
// are fully self-contained. Only the leader of the active team sees them.
export default function LeaderPanel({ challenge, onClue, submitting }) {
  const [clue, setClue] = useState('');
  const canSubmit = clue.trim().length >= 2 && !submitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onClue(clue.trim());
  };

  const imageCard = (emoji, label, grad) => (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 p-6 ${grad}`}
    >
      <span className="text-7xl drop-shadow-lg">{emoji}</span>
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

      <div className="grid grid-cols-2 gap-4">
        {imageCard(challenge.imageA.emoji, challenge.imageA.label, 'bg-gradient-to-br from-rose-500/20 to-orange-500/10')}
        {imageCard(challenge.imageB.emoji, challenge.imageB.label, 'bg-gradient-to-br from-sky-500/20 to-indigo-500/10')}
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <label htmlFor="clue" className="mb-1 block text-sm font-bold text-slate-200">
          اكتب تلميحك لصور تمر بين الصورتين 🧠
        </label>
        <div className="flex gap-2">
          <input
            id="clue"
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            maxLength={40}
            placeholder="مثال: حاجة بتتباع في البيت..."
            className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-white outline-none focus:border-gold-400"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 rounded-xl bg-gold-500 px-5 font-black text-night-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '...' : 'ابعت التلميح 🔒'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          أول ما تبعت التلميح مفيش تعديل — فريقك هيشوف 4 اختيارات ويختار.
        </p>
      </form>
    </section>
  );
}
