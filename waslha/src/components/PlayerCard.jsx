import Avatar from './Avatar.jsx';
import { teamTheme } from '../utils/helpers.js';

export default function PlayerCard({ player, isMe, isHost, showTeam }) {
  const theme = teamTheme(player.team);
  const teamColor =
    theme.color === 'rose' ? 'ring-rose-400/50' : theme.color === 'sky' ? 'ring-sky-400/50' : 'ring-white/10';

  return (
    <div
      className={`glass flex items-center gap-3 rounded-2xl p-3 ring-1 ${teamColor} ${
        isMe ? 'bg-white/5' : ''
      }`}
    >
      <Avatar avatar={player.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">
          {player.username}
          {isMe && <span className="mr-1 text-xs text-brand-300">(انت)</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
          {showTeam && <span>{showTeam}</span>}
          {player.isLeader && <span className="rounded bg-gold-500/20 px-1.5 text-gold-300">قائد</span>}
          {isHost && <span className="rounded bg-brand-500/20 px-1.5 text-brand-300">Host</span>}
          {player.isReady && <span className="text-emerald-400">جاهز ✓</span>}
          {player.online ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> أونلاين
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-600" /> أوفلاين
            </span>
          )}
        </div>
      </div>
      <span className="text-sm font-black text-slate-200">{player.score ?? 0} نقطة</span>
    </div>
  );
}
