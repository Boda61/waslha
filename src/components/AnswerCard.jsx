export default function AnswerCard({ choice, index, state, onClick, disabled }) {
  // state: 'default' | 'selected' | 'correct' | 'incorrect' | 'dimmed'
  const base =
    'answer-card group flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 text-center transition-all';
  let cls = 'border-white/10 bg-night-800 hover:-translate-y-0.5 hover:border-brand-400/60 hover:bg-night-700 cursor-pointer';
  if (state === 'selected') cls = 'border-gold-400 bg-gold-500/20';
  if (state === 'correct') cls = 'border-emerald-400 bg-emerald-500/20';
  if (state === 'incorrect') cls = 'border-rose-500 bg-rose-500/20 opacity-60';
  if (state === 'dimmed') cls = 'border-white/5 bg-night-800 opacity-40';

  return (
    <button
      onClick={() => !disabled && onClick?.(index)}
      disabled={disabled}
      data-state={state}
      className={`${base} ${cls} ${disabled ? 'cursor-not-allowed' : ''}`}
      aria-label={`إجابة: ${choice}`}
    >
      <span className="text-sm font-black text-brand-300">اختيار {index + 1}</span>
      <span className="text-lg font-extrabold leading-snug text-white">{choice}</span>
      {state === 'selected' && <span className="text-sm text-gold-300">أخترت ده ✓</span>}
      {state === 'correct' && <span className="text-sm text-emerald-300">ده هو الصح 🎉</span>}
      {state === 'incorrect' && <span className="text-sm text-rose-300">غلط ✗</span>}
    </button>
  );
}
