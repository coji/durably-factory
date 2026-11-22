import { formatCount } from '../../engine/format'
import { FACTORY } from '../glossary'
import { BUTTON } from './button'

/**
 * Fake tasks are left out of the flow and the trend unless asked for. The
 * switch shows when they are all the window has, or while they are in.
 */
export function FakeSwitch({
  fake,
  onFake,
  onlyFake,
  fakeExcluded,
}: {
  fake: boolean
  onFake: (fake: boolean) => void
  /** Every task in the window is fake, so nothing else shows. */
  onlyFake: boolean
  fakeExcluded: number
}) {
  if (!fake && !onlyFake) return null
  return (
    <p className="border-line bg-raised flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
      {fake
        ? FACTORY.includesFake
        : FACTORY.fakeOnly(formatCount(fakeExcluded))}
      <button type="button" onClick={() => onFake(!fake)} className={BUTTON}>
        {fake ? FACTORY.excludeFake : FACTORY.includeFake}
      </button>
    </p>
  )
}
