export default function VoiceChatControls({
  status,
  micOn,
  remoteSpeaking,
  error,
  peerName,
  onStart,
  onToggleMute,
}) {
  const connected = status === 'connected';
  const inCall = status === 'connecting' || status === 'connected';

  return (
    <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-2xl px-4 py-3">
      {/* Mic toggle */}
      <button
        type="button"
        onClick={connected || status === 'connecting' ? onToggleMute : onStart}
        disabled={status === 'requesting'}
        title={connected || status === 'connecting' ? 'كتم المايك / فتحه' : 'شغّل المايك'}
        aria-pressed={micOn}
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
          inCall
            ? micOn
              ? 'bg-brand-500 text-night-950 hover:bg-brand-400'
              : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40'
            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
        }`}
      >
        {micOn ? '🎙️ المايك شغال' : '🔇 المايك مقفول'}
      </button>

      {/* Connection / status label */}
      {status === 'requesting' && (
        <span className="text-sm font-bold text-slate-300">
          ⏳ بنطلب صلاحية المايك...
        </span>
      )}
      {status === 'connecting' && (
        <span className="text-sm font-bold text-yellow-300">🟡 جاري الاتصال...</span>
      )}
      {status === 'connected' && (
        <span className="text-sm font-bold text-emerald-300">🟢 متصل</span>
      )}
      {status === 'error' && (
        <span className="text-sm font-bold text-rose-300">
          🔴 {error || 'الاتصال الصوتي مش متاح'}
        </span>
      )}
      {status === 'idle' && (
        <span className="text-sm text-slate-400">
          🎙️ اتكلم مع {peerName} وهو بيوصف
        </span>
      )}

      {/* Remote speaking indicator */}
      {connected && remoteSpeaking && (
        <span className="flex items-center gap-1.5 text-sm font-bold text-brand-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
          {peerName} بيتكلم...
        </span>
      )}
    </div>
  );
}