import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import {
  listHebdCategories,
  createHebdRoom,
  getRoomMode,
  joinHebdRoom,
} from '../../services/hebdService.js';

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 10;

export default function HebdHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  // Shared UI state
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Create form
  const [categories, setCategories] = useState(null); // null = loading
  const [selected, setSelected] = useState([]);
  const [totalRounds, setTotalRounds] = useState(5);

  // Join form
  const [code, setCode] = useState('');

  // Load the public category catalog once.
  useEffect(() => {
    let mounted = true;
    listHebdCategories()
      .then((items) => {
        if (!mounted) return;
        setCategories(items);
        setError('');
      })
      .catch((err) => {
        console.error('listHebdCategories error:', err);
        if (!mounted) return;
        setCategories([]);
        setError(err.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleCategory = useCallback((id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }, []);

  const handleCreate = async () => {
    if (!profile) return;
    setError('');
    if (selected.length < 1) {
      setError('اختار فئة واحدة على الأقل.');
      return;
    }
    setBusy(true);
    try {
      const { roomId } = await createHebdRoom(totalRounds, selected);
      push('اتعملت اللعبة! ابعتها لصاحبك 💪', 'success');
      navigate(`/hebd/lobby/${roomId}`);
    } catch (err) {
      console.error('create_hebd_room error:', err);
      setError(err.message);
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    setError('');
    if (!clean) {
      setError('اكتب كود اللعبة.');
      return;
    }
    setBusy(true);
    try {
      const mode = await getRoomMode(clean);
      if (!mode) {
        setError('❌ كود اللعبة غير صحيح');
        setBusy(false);
        return;
      }
      if (mode !== 'hebd') {
        setError('الغرفة دي مش مود هيبد — جرب مود تاني.');
        setBusy(false);
        return;
      }
      const { roomId } = await joinHebdRoom(clean);
      push('دخلت اللعبة! 🎉', 'success');
      navigate(`/hebd/lobby/${roomId}`);
    } catch (err) {
      console.error('join_hebd_room error:', err);
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-10">
      <div className="animate-fade-up glass rounded-3xl p-6 sm:p-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-white sm:text-4xl">
            🎮 هبد في هبد
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            مود 1 ضد 1 — كل واحد بياخد دوره يعرض، والتاني يحزر قبل ما الوقت
            يخلص. مين يفتح إيده الأول؟ 😏
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-night-800/60 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('create');
              setError('');
            }}
            className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
              tab === 'create'
                ? 'bg-brand-500 text-night-950'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            إنشاء لعبة
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('join');
              setError('');
            }}
            className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
              tab === 'join'
                ? 'bg-brand-500 text-night-950'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            انضمام للعبة
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-300">
            {error}
          </p>
        )}
{/* Create tab */}
        {tab === 'create' && (
          <div className="mt-6 space-y-6">
            {/* Number of rounds */}
            <div>
              <label htmlFor="hebd-rounds" className="mb-2 block text-sm font-bold text-slate-200">
                عدد الجولات: <span className="text-brand-300">{totalRounds}</span>
              </label>
              <input
                id="hebd-rounds"
                type="range"
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                value={totalRounds}
                onChange={(e) => setTotalRounds(Number(e.target.value))}
                className="w-full accent-teal-400"
              />
              <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{MIN_ROUNDS}</span>
                <span>{MAX_ROUNDS}</span>
              </div>
            </div>

            {/* Categories */}
            <div>
              <p className="mb-2 text-sm font-bold text-slate-200">
                اختار الفئات <span className="text-xs font-normal text-slate-500">(واحدة على الأقل)</span>
              </p>

              {categories === null ? (
                <LoadingScreen label="بنجيب الفئات..." />
              ) : categories.length === 0 ? (
                <p className="rounded-xl bg-night-800/60 px-4 py-3 text-sm text-slate-400">
                  مفيش فئات متاحة للعب دلوقتي. جرب تاني قريب.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {categories.map((cat) => {
                    const isOn = selected.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() => toggleCategory(cat.id)}
                        className={`rounded-2xl border-2 p-3 text-center transition ${
                          isOn
                            ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-400/40'
                            : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-2xl">{cat.emoji}</span>
                        <p className="mt-1 truncate text-xs font-bold text-white">{cat.name}</p>
                        {isOn && (
                          <p className="mt-1 text-[10px] font-black text-brand-300">مختارة ✓</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={busy || selected.length < 1}
              className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'جاري إنشاء اللعبة...' : 'إنشاء لعبة 🚀'}
            </button>
          </div>
        )}

        {/* Join tab */}
        {tab === 'join' && (
          <form onSubmit={handleJoin} className="mt-6 space-y-4">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="كود اللعبة"
              maxLength={6}
              inputMode="text"
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-4 text-center text-3xl font-black tracking-[0.3em] text-white outline-none transition focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand-500 py-3 text-lg font-black text-night-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'بندخلك...' : 'انضمام للعبة 🚪'}
            </button>
            <p className="text-center text-xs text-slate-500">
              الكود بيبعتلك من اللي عمل اللعبة — 5 حروف.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}