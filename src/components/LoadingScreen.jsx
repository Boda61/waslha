export default function LoadingScreen({ label = 'بنحمل...' }) {
  return (
    <div className="game-bg flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-night-600 border-t-brand-400" />
      <p className="text-lg font-semibold text-slate-300">{label}</p>
    </div>
  );
}
