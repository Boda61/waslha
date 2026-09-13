// GameWinnerOverlay — shown when the match ends with a winner
export default function GameWinnerOverlay({ gameResult, onPlayAgain, onLeave }) {
  if (!gameResult) return null;

  const { isMyWin, isDraw, scores, roundsPlayed } = gameResult;

  if (isDraw) {
    return <GameDrawOverlay gameResult={gameResult} onPlayAgain={onPlayAgain} onLeave={onLeave} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass animate-pop max-w-sm w-full rounded-3xl p-8 text-center shadow-2xl">
        <span className="text-6xl">{isMyWin ? '👑' : '🎉'}</span>
        <h2 className="mt-4 text-3xl font-black text-white">
          {isMyWin ? 'أنت الفائز!' : 'اللاعب الآخر فاز'}
        </h2>
        <p className="mt-2 text-slate-400">
          انتهت المباراة بعد {roundsPlayed} جولات
        </p>

        {scores && (
          <div className="mt-6 flex justify-center gap-6">
            {Object.entries(scores).map(([userId, score]) => {
              const isWinner = userId === gameResult.winnerUserId;
              return (
                <div key={userId} className="text-center">
                  <span className="text-2xl">{isWinner ? '👑' : '🎮'}</span>
                  <p className={`mt-1 text-4xl font-black ${isWinner ? 'text-gold-300' : 'text-slate-300'}`}>
                    {score}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isWinner ? 'الفائز' : 'الخاسر'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 space-y-3">
          <button
            onClick={onPlayAgain}
            className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400"
          >
            العب تاني 🔄
          </button>
          <button
            onClick={onLeave}
            className="w-full rounded-xl border border-white/10 bg-night-700 py-3 text-lg font-bold text-white transition hover:bg-night-600"
          >
            خروج
          </button>
        </div>
      </div>
    </div>
  );
}

// GameDrawOverlay — shown when the match ends in a draw
function GameDrawOverlay({ gameResult, onPlayAgain, onLeave }) {
  if (!gameResult) return null;

  const { scores, roundsPlayed } = gameResult;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass animate-pop max-w-sm w-full rounded-3xl p-8 text-center shadow-2xl">
        <span className="text-6xl">🤝</span>
        <h2 className="mt-4 text-3xl font-black text-white">تعادل!</h2>
        <p className="mt-2 text-slate-400">
          انتهت المباراة بعد {roundsPlayed} جولات
        </p>

        {scores && (
          <div className="mt-6 flex justify-center gap-6">
            {Object.entries(scores).map(([userId, score]) => (
              <div key={userId} className="text-center">
                <span className="text-2xl">🎮</span>
                <p className="mt-1 text-4xl font-black text-brand-300">{score}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 space-y-3">
          <button
            onClick={onPlayAgain}
            className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400"
          >
            العب تاني 🔄
          </button>
          <button
            onClick={onLeave}
            className="w-full rounded-xl border border-white/10 bg-night-700 py-3 text-lg font-bold text-white transition hover:bg-night-600"
          >
            خروج
          </button>
        </div>
      </div>
    </div>
  );
}