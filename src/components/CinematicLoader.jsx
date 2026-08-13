import './CinematicLoader.css';
import { useLoading } from '../contexts/LoadingContext.jsx';

export default function CinematicLoader() {
  try {
    const { isInitializing } = useLoading();
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    console.log('[CinematicLoader] render - isInitializing:', isInitializing);

    if (!isInitializing) {
      console.log('[CinematicLoader] hiding loader');
      return null;
    }

    console.log('[CinematicLoader] showing loader');

    return (
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center ${
          prefersReducedMotion ? 'loader-reduced-motion' : ''
        }`}
        style={{
          background: 'linear-gradient(135deg, #070b14 0%, #0b1120 50%, #111a2e 100%)',
        }}
      >
        {/* Vignette overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%)',
        }} />

        {/* Animated background glow */}
        <div className="cinematic-glow-1" />
        <div className="cinematic-glow-2" />

        {/* Main content container */}
        <div className="relative z-10 flex flex-col items-center gap-8 px-4">
          {/* Branding container */}
          <div className="cinematic-branding-wrapper">
            {/* Light sweep effect */}
            <div className="cinematic-light-sweep" />

            {/* Logo/Text with glow */}
            <div className="cinematic-logo-container">
              <h1 className="cinematic-logo-text">
                WASLHA
              </h1>
              <div className="cinematic-logo-glow" />
            </div>

            {/* Subtitle with subtle animation */}
            <p className="cinematic-subtitle">
              لعبة الألغاز الاجتماعية
            </p>
          </div>

          {/* Loading indicator section */}
          <div className="cinematic-loading-section">
            {/* Elegant loading indicator */}
            <div className="cinematic-loader-container">
              <div className="cinematic-loader-dot cinematic-loader-dot-1" />
              <div className="cinematic-loader-dot cinematic-loader-dot-2" />
              <div className="cinematic-loader-dot cinematic-loader-dot-3" />
            </div>

            {/* Loading text */}
            <p className="cinematic-loading-text">
              جاري تجهيز اللعبة...
            </p>
          </div>
        </div>

        {/* Subtle ambient particles effect (mobile-friendly) */}
        <div className="cinematic-ambient-container">
          <div className="cinematic-particle cinematic-particle-1" />
          <div className="cinematic-particle cinematic-particle-2" />
          <div className="cinematic-particle cinematic-particle-3" />
        </div>
      </div>
    );
  } catch (error) {
    console.error('[CinematicLoader] Error:', error);
    return null;
  }
}
