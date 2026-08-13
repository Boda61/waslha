import { useState } from 'react';
import { useToast } from '../contexts/ToastContext.jsx';

export default function RoomCode({ code }) {
  const [copied, setCopied] = useState(false);
  const { push } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      push('اتنسخ الكود ✅', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push('مقدرناش ننسخ. انسخه يدوي.', 'error');
    }
  };

  return (
    <button
      onClick={copy}
      className="group flex flex-col items-center gap-1 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-6 py-3 transition hover:bg-brand-500/20"
      title="اضغط تنسخ الكود"
    >
      <span className="text-xs font-semibold text-brand-300">كود الغرفة</span>
      <span className="flex items-center gap-2 text-2xl font-black tracking-widest text-white">
        {code}
        <span className="text-base text-brand-300 group-hover:scale-110 transition">
          {copied ? '✓' : '📋'}
        </span>
      </span>
    </button>
  );
}
