import { useEffect, useState } from 'react';
import './CinematicLoader.css';
import { useLoading } from '../contexts/LoadingContext.jsx';

/**
 * Minimum visual duration to avoid a flash when auth resolves instantly.
 * Matches the intro animation timeline (branding, sweep, loading status).
 */
const MIN_DISPLAY_TIME = 1200;

/**
 * Safety net: never block the application longer than this,
 * even if initialization never signals completion.
 */
const SAFETY_TIMEOUT = 5000;

/**
 * Matches the loader-fade-out keyframe duration in CinematicLoader.css.
 */
const FADE_OUT_DURATION = 600;

export default function CinematicLoader() {
  const { isInitializing } = useLoading();
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [mountTime] = useState(() => Date.now());
  const [prefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (isInitializing) return undefined;

    const elapsed = Date.now() - mountTime;
    const remainingMinTime = Math.max(0, MIN_DISPLAY_TIME - elapsed);

    let removeTimer;

    const minDisplayTimer = setTimeout(() => {
      setIsExiting(true);

      // Reduced-motion users get an instant handoff, no fade needed.
      if (prefersReducedMotion) {
        setShouldRender(false);
        return;
      }

      removeTimer = setTimeout(() => {
        setShouldRender(false);
      }, FADE_OUT_DURATION);
    }, remainingMinTime);

    // Safety net: hide the loader even if initialization never completes.
    const safetyTimer = setTimeout(() => {
      clearTimeout(minDisplayTimer);
      clearTimeout(removeTimer);
      setIsExiting(true);
      setShouldRender(false);
    }, SAFETY_TIMEOUT);

    return () => {
      clearTimeout(minDisplayTimer);
      clearTimeout(removeTimer);
      clearTimeout(safetyTimer);
    };
  }, [isInitializing, prefersReducedMotion, mountTime]);

  if (!shouldRender) return null;

  return (
    <div
      className={`cinematic-loader-overlay flex items-center justify-center ${
        isExiting ? 'loader-exiting' : ''
      } ${prefersReducedMotion ? 'loader-reduced-motion' : ''}`}
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
}