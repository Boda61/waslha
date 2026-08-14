import { useEffect, useRef, useState } from 'react';
import { subscribeMessages } from '../services/chatService.js';
import ChatPanel from './ChatPanel.jsx';

// Toggle button for the team chat (placed next to the leave-room button).
// Shows an unread-count badge while the chat is closed, and opens a
// slide-in drawer (bottom sheet on mobile, side drawer on desktop).
export default function ChatLauncher({ roomId, roundId, canChat, currentPlayer }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const seenRef = useRef(0);

  useEffect(() => {
    setOpen(false);
    setUnread(0);
    seenRef.current = 0;
    const unsub = subscribeMessages(roomId, roundId, setMessages);
    return unsub;
  }, [roomId, roundId]);

  // Count messages that arrive while the chat is closed.
  useEffect(() => {
    if (!open && messages.length > seenRef.current) {
      setUnread(messages.length - seenRef.current);
    }
  }, [messages, open]);

  const openChat = () => {
    seenRef.current = messages.length;
    setUnread(0);
    setOpen(true);
  };

  const closeChat = () => {
    seenRef.current = messages.length;
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={open ? closeChat : openChat}
        aria-label="فتح الشات"
        aria-expanded={open}
        className="chat-launcher-btn relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg transition hover:bg-white/10"
      >
        <span className={open ? 'opacity-60' : ''}>💬</span>
        {unread > 0 && !open && (
          <span className="chat-badge" aria-label={`${unread} رسائل جديدة`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="chat-launcher-overlay" onClick={closeChat}>
          <div
            className="chat-launcher-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <ChatPanel
              roomId={roomId}
              roundId={roundId}
              canChat={canChat}
              currentPlayer={currentPlayer}
              messages={messages}
              onClose={closeChat}
            />
          </div>
        </div>
      )}
    </>
  );
}
