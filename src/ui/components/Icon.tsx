/**
 * The few drawn icons the page uses, one stroke weight, sized to the text
 * around them. Decorative: the words beside them carry the meaning.
 */
const PATHS = {
  right: 'M3 8h10M9 4l4 4-4 4',
  left: 'M13 8H3M7 4L3 8l4 4',
  up: 'M8 13V3M4 7l4-4 4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
  pause: 'M6 4v8M10 4v8',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  className = '',
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`inline-block size-[1em] shrink-0 align-[-0.125em] ${className}`}
    >
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
