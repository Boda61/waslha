// RoundWinnerOverlay — shown when a round is won
export default function RoundWinnerOverlay({ roundResult, onClose }) {
  if (!roundResult) return null;

  const { isMyWin, scores, roundNumber } = roundResult;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass animate-pop max-w-sm w-full rounded-3xl p-8 text-center shadow-2xl">
        <span className="text-6xl">{isMyWin ? '🏆' : '😅'}</span>
        <h2 className="mt-4 text-2xl font-black text-white">
          {isMyWin ? 'كسبت الجولة!' : 'اللاعب الآخر كسب الجولة'}
        </h2>
        <p className="mt-2 text-slate-400">
          الجولة {roundNumber}
        </p>
        
        {scores && (
          <div className="mt-4 flex justify-center gap-4">
            {Object.entries(scores).map(([userId, score]) => (
              <div key={userId} className="text-center">
                <p className="text-3xl font-black text-brand-300">{score}</p>
                <p className="text-xs text-slate-500">
                  {userId === roundResult.winnerUserId ? 'الفائز' : 'الخاسر'}
                </p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400"
        >
          متابعة
        </button>
      </div>
    </div>
  );
}