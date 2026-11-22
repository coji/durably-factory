import type { ReactNode } from 'react'

import { REFRESH, SHELL } from '../glossary'
import { pageHref, type Route } from '../route'
import type { PollState } from '../usePolled'
import { focusPageTitle } from './Layout'
import { clockFormat } from './Time'

/**
 * The refresh time is shown but never announced. Screen readers hear only a
 * change of state: an alert when refreshing starts failing, and a status
 * line once it works again.
 */
export function RefreshStatus({ polled }: { polled: PollState<unknown> }) {
  const at = polled.fetchedAt ? clockFormat.format(polled.fetchedAt) : null
  const failing = polled.error !== null
  return (
    <div className="text-fg-2 text-xs">
      {failing ? (
        <>
          <p role="alert" className="sr-only">
            {REFRESH.failedAlert}
          </p>
          <p>
            {REFRESH.failed}
            {at ? REFRESH.staleAt(at) : ''}
          </p>
          <p className="font-code">{polled.error}</p>
        </>
      ) : (
        <p className="tabular-nums">
          {at ? REFRESH.freshAt(at) : REFRESH.loading}
          {at ? (
            <span className="hidden sm:inline">{REFRESH.every}</span>
          ) : null}
        </p>
      )}
      <p role="status" className="sr-only">
        {polled.recovered ? REFRESH.recovered : ''}
      </p>
    </div>
  )
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string
  current: boolean
  children: ReactNode
}) {
  return (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm no-underline ${current ? 'bg-brand-soft text-brand font-semibold' : 'text-fg-2 hover:bg-sunken hover:text-fg'}`}
    >
      {children}
    </a>
  )
}

/**
 * The sticky header with the three screens, and the page below it. Every
 * screen opens narrowed to `repo`, the repository last chosen.
 */
export function Shell({
  route,
  repo,
  status,
  children,
}: {
  route: Route
  repo?: string
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen">
      {/* The hash is the router, so the skip link moves focus itself. */}
      <button
        type="button"
        onClick={focusPageTitle}
        className="bg-raised text-fg sr-only z-(--z-toast) rounded-md px-3 py-2 text-sm shadow-(--shadow-pop) focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {SHELL.skipToContent}
      </button>
      {/* On a phone the header scrolls away, so the page gets the screen. */}
      <header className="border-line bg-raised top-0 z-(--z-sticky) border-b sm:sticky">
        <div className="mx-auto flex max-w-(--size-page) flex-wrap items-center gap-x-8 gap-y-1 px-4 py-2 sm:px-8">
          <a
            href={pageHref('factory', repo)}
            className="text-fg flex basis-full items-center gap-2 text-base font-bold no-underline sm:basis-auto"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="text-brand size-4">
              <path d="M1 15V6l4 3V6l4 3V6l4 3V1h2v14z" fill="currentColor" />
            </svg>
            {SHELL.product}
          </a>
          <nav aria-label={SHELL.nav} className="flex gap-1">
            <NavLink
              href={pageHref('factory', repo)}
              current={route.page === 'factory'}
            >
              {SHELL.factory}
            </NavLink>
            <NavLink
              href={pageHref('runs', repo)}
              current={route.page === 'runs' || route.page === 'run'}
            >
              {SHELL.runs}
            </NavLink>
            <NavLink
              href={pageHref('compare', repo)}
              current={route.page === 'compare'}
            >
              {SHELL.compare}
            </NavLink>
          </nav>
          {status ? <div className="ml-auto">{status}</div> : null}
        </div>
      </header>
      <main className="mx-auto max-w-(--size-page) px-4 py-6 sm:px-8">
        {children}
      </main>
    </div>
  )
}
