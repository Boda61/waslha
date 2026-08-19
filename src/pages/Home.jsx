import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const steps = [
  {
    emoji: '🚪',
    title: 'اعمل غرفة أو ادخل بكود',
    desc: 'اعمل غرفة جديدة وخلي صحابك يدخلوا بكود سهل، واختار المود اللي تحبه.',
  },
  {
    emoji: '🕵️',
    title: 'القائد يشوف الصور السرية',
    desc: 'القائد بس هو اللي بيشوف الصورتين السريتين ويكتب تلميح للكل.',
  },
  {
    emoji: '⚡',
    title: 'الكل بيتسابق',
    desc: 'أول ما التلميح يظهر، الكل يشوف 4 اختيارات — سواء في فرق أو كل واحد لوحده.',
  },
  {
    emoji: '🏆',
    title: 'أول إجابة صح تكسب',
    desc: 'أول واحد (أو فريق) يجاوب صح ياخد النقاط — سهل 50، متوسط 75، صعب 100، واللي عنده أعلى نقاط يفوز.',
  },
];

export default function Home() {
  const { isAuthenticated, profile } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-8 py-16 text-center">
        <h1 className="animate-fade-up text-6xl font-black text-white sm:text-7xl">
          وصلها <span className="text-brand-400 text-glow">🎮</span>
        </h1>
        <p className="max-w-2xl animate-fade-up text-lg leading-relaxed text-slate-300">
          لعبة جماعية أونلاين. القائد يشوف صورتين سرية ويعطيك تلميح، وفريقك لازم
          يوصّل للإجابة الصح قبل الفريق التاني. عربي 100% ومليانة طقطقة 🤙
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                to="/create"
                className="rounded-2xl bg-brand-500 px-8 py-4 text-lg font-black text-night-950 shadow-lg shadow-brand-500/30 transition hover:scale-105 hover:bg-brand-400"
              >
                اعمل غرفة جديدة
              </Link>
              <Link
                to="/join"
                className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
              >
                ادخل بكود
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/register"
                className="rounded-2xl bg-brand-500 px-8 py-4 text-lg font-black text-night-950 shadow-lg shadow-brand-500/30 transition hover:scale-105 hover:bg-brand-400"
              >
                ابدأ العب دلوقتي
              </Link>
              <Link
                to="/login"
                className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-lg font-bold text-white transition hover:bg-white/10"
              >
                أنا معايا حساب
              </Link>
            </>
          )}
        </div>

        {isAuthenticated && profile && (
          <p className="text-sm text-slate-400">
            أهلاً يا <span className="font-bold text-brand-300">{profile.username}</span> 👋
            عايز تلعب مع صحابك؟
          </p>
        )}
      </section>

      {/* How to play */}
      <section className="mt-8" aria-label="إزاي تلعب">
        <h2 className="mb-6 text-center text-3xl font-extrabold text-white">
          إزاي تلعب؟
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <article
              key={i}
              className="glass animate-fade-up rounded-2xl p-6 transition hover:-translate-y-1"
            >
              <span className="text-4xl">{s.emoji}</span>
              <h3 className="mt-3 text-lg font-extrabold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Party-race feature banner */}
      <section className="glass mt-10 flex flex-col items-center gap-4 rounded-2xl p-8 text-center sm:flex-row sm:text-right">
        <span className="text-5xl">⚡</span>
        <div>
          <h3 className="text-2xl font-extrabold text-gold-300">
            الكل بيلعب في نفس الوقت!
          </h3>
          <p className="mt-2 text-slate-300">
            أول ما القائد يبعت التلميح، الجميع بيتسابق عشان يوصل للإجابة الصح —
            أول واحد يجيبها يكسب الجولة 🏆. اختار <span className="font-bold text-white">وضع الفريقين</span>{' '}
            لو حابب تلعبوا تيم تيم، أو <span className="font-bold text-white">الكل لوحده</span> لو كل واحد
            عايز ينافس بنفسه.
          </p>
        </div>
      </section>
    </div>
  );
}
