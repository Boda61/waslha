import { useEffect, useRef, useState } from 'react';
import { subscribeMessages, sendMessage } from '../services/chatService.js';
import Avatar from './Avatar.jsx';
import { timeAgo } from '../utils/helpers.js';
import { CHAT_LIMITS } from '../utils/constants.js';

export default function ChatPanel({ roomId, roundId, canChat, currentPlayer }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeMessages(roomId, roundId, setMessages);
    return unsub;
  }, [roomId, roundId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !canChat || !currentPlayer) return;
    setError('');
    try {
      await sendMessage(roomId, roundId, currentPlayer, text);
      setText('');
    } catch (err) {
      setError(err.message || 'مش قدرنا نرسل الرسالة.');
    }
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-night-900/60">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-lg">💬</span>
        <h3 className="font-bold text-white">شات الفريق</h3>
        {canChat && (
          <span className="mr-auto text-xs text-emerald-400">مفتوح ليك ✍️</span>
        )}
        {!canChat && (
          <span className="mr-auto text-xs text-slate-500">وضع المشاهدة 👀</span>
        )}
      </header>

      <div ref={scrollRef} className="chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            {canChat ? 'ابدأوا النقاش أول ما يظهر التلميح 👇' : 'مفيش رسايل لسه...'}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar avatar={m.avatar} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">{m.senderName}</span>
                <span className="text-[10px] text-slate-500">
                  {m.team === 'red' ? '🔴' : m.team === 'blue' ? '🔵' : ''} {timeAgo(m.createdAt)}
                </span>
              </div>
              <p className="break-words rounded-xl rounded-tr-sm bg-night-800 px-3 py-2 text-sm text-slate-100">
                {m.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="border-t border-white/10 p-3">
        {canChat ? (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={CHAT_LIMITS.maxLength}
              placeholder="اكتب رسالتك..."
              className="w-full rounded-xl border border-white/10 bg-night-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              إرسال
            </button>
          </div>
        ) : (
          <p className="rounded-xl bg-night-800 px-3 py-2 text-center text-xs text-slate-500">
            👀 انت بتتفرج بس — مش بتقدر تبعت رسايل
          </p>
        )}
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </form>
    </section>
  );
}
