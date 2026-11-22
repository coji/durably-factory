import { REPO } from '../glossary'
import { pageHref, type ListPage } from '../route'
import type { RepoScope } from '../server'
import { segment } from './button'

/**
 * Which repository the page counts, as links, so the choice lives in the
 * URL: all of them, or one. The current one is the one the server says it
 * counted, so a key no run has any more reads as all. Not drawn while the
 * runs have only one repository, since there is nothing to choose.
 */
export function RepoFilter({
  page,
  scope,
}: {
  page: ListPage
  scope: RepoScope
}) {
  if (scope.repos.length < 2) return null
  // A repository's path shows on hover; the sample and all have none.
  const option = (key: string | null, label: string) => (
    <li key={key ?? ''}>
      <a
        href={pageHref(page, key ?? undefined)}
        title={key?.startsWith('/') ? key : undefined}
        aria-current={scope.repo === key ? 'true' : undefined}
        className={segment(scope.repo === key)}
      >
        {label}
      </a>
    </li>
  )
  return (
    <nav aria-label={REPO.label} className="mb-4 flex flex-col gap-1">
      <span className="text-fg-2 text-xs">{REPO.label}</span>
      {/* A phone has no room for every repository side by side. */}
      <select
        aria-label={REPO.label}
        value={scope.repo ?? ''}
        onChange={(e) => {
          window.location.hash = pageHref(page, e.target.value || undefined)
        }}
        className="border-line-strong bg-raised text-fg min-h-11 rounded-md border px-3 text-sm sm:hidden"
      >
        <option value="">{REPO.all}</option>
        {scope.repos.map((r) => (
          <option key={r.key} value={r.key}>
            {r.name}
          </option>
        ))}
      </select>
      <ul className="bg-sunken hidden flex-wrap self-start rounded-md p-1 sm:inline-flex">
        {option(null, REPO.all)}
        {scope.repos.map((r) => option(r.key, r.name))}
      </ul>
    </nav>
  )
}
