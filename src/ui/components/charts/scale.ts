import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Steps a duration axis may take, so its ticks land on round times. */
const TIME_STEPS = [
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  24 * HOUR,
  48 * HOUR,
]

/**
 * An axis from 0 to at least `max`, in about `count` round steps: the
 * guidebook keeps every quantity's origin at 0.
 */
export function niceAxis(
  max: number,
  count = 4,
  steps?: number[],
): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0] }
  const raw = max / count
  let step: number
  if (steps) step = steps.find((s) => s >= raw) ?? (steps.at(-1) as number)
  else {
    const p = 10 ** Math.floor(Math.log10(raw))
    step = ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p
  }
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { max: top, ticks }
}

export function timeAxis(maxMs: number, count = 4) {
  return niceAxis(maxMs, count, TIME_STEPS)
}

/**
 * The width of the element `ref` is on, followed as it resizes; `initial`
 * until it is measured, which is all a page rendered on the server gets.
 */
export function useWidth<T extends Element>(
  initial = 640,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const seen = new ResizeObserver(measure)
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  return [ref, width]
}
