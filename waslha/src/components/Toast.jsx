import { useToast } from '../contexts/ToastContext.jsx';

const styleMap = {
  success: 'bg-emerald-500/90 border-emerald-300/30',
  error: 'bg-rose-500/90 border-rose-300/30',
  info: 'bg-night-700/90 border-white/10',
};

const iconMap = {
  success: '✅',
  error: '⚠️',
  info: '💬',
};

export default function Toast() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`${styleMap[t.type] || styleMap.info} animate-pop w-full max-w-sm rounded-xl border px-4 py-3 text-right text-sm font-semibold text-white shadow-xl backdrop-blur`}
        >
          <span className="ml-2">{iconMap[t.type] || iconMap.info}</span>
          {t.message}
        </button>
      ))}
    </div>
  );
}
