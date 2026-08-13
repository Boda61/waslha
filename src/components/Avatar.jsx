export default function Avatar({ avatar = '🦁', size = 'md' }) {
  const sizes = {
    sm: 'h-8 w-8 text-lg',
    md: 'h-10 w-10 text-xl',
    lg: 'h-14 w-14 text-3xl',
  };
  return (
    <span
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full bg-night-700 ring-1 ring-white/10`}
      aria-hidden="true"
    >
      {avatar}
    </span>
  );
}
