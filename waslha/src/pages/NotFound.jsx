import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="text-7xl">🧭</span>
      <h1 className="mt-4 text-4xl font-black text-white">الصفحة دي مش موجودة</h1>
      <p className="mt-2 text-slate-400">يبدو إنك اتوهت شوية 😅</p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 transition hover:bg-brand-400"
      >
        ارجع للرئيسية
      </Link>
    </div>
  );
}
