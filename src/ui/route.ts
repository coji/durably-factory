/**
 * The page's routes, read from the location hash: the factory at `#/`, the
 * task list at `#/tasks`, the review at `#/review` (`#/compare` before it),
 * one run, and the design page. Every page but the design page can be
 * narrowed to one repository by its key, as `?repo=` after the path; a
 * run's page keeps the one its list had, for its links back.
 */
export type Route =
  | { page: 'factory'; repo?: string }
  | { page: 'runs'; repo?: string }
  | { page: 'run'; id: string; repo?: string }
  | { page: 'compare'; repo?: string }
  | { page: 'design' }

export function parseRoute(hash: string): Route {
  const at = hash.indexOf('?')
  const path = at < 0 ? hash : hash.slice(0, at)
  const repo =
    at < 0 ? null : new URLSearchParams(hash.slice(at + 1)).get('repo')
  const scope = repo ? { repo } : {}
  const run = /^#\/runs\/(.+)$/.exec(path)
  if (run?.[1]) return { page: 'run', id: decodeURIComponent(run[1]), ...scope }
  if (path === '#/review' || path === '#/compare')
    return { page: 'compare', ...scope }
  if (path === '#/tasks') return { page: 'runs', ...scope }
  if (path === '#/design') return { page: 'design' }
  return { page: 'factory', ...scope }
}

export function routeKey(route: Route): string {
  return route.page === 'run' ? `run:${route.id}` : route.page
}

/** `path` narrowed to `repo` when given one. */
export function withRepo(path: string, repo?: string): string {
  return repo ? `${path}?repo=${encodeURIComponent(repo)}` : path
}

export type ListPage = 'factory' | 'runs' | 'compare'

const PAGE_PATH: Record<ListPage, string> = {
  factory: '#/',
  runs: '#/tasks',
  compare: '#/review',
}

/** `url` asking for fake tasks too when `fake`, after any `?repo=`. */
export function withFake(url: string, fake: boolean): string {
  return fake ? `${url}${url.includes('?') ? '&' : '?'}fake=1` : url
}

/** Where a page of the header is, narrowed to `repo` when given one. */
export function pageHref(page: ListPage, repo?: string): string {
  return withRepo(PAGE_PATH[page], repo)
}

/**
 * Where the list or the summary should be once the server says which
 * repository it counted, `counted`: all of them for a key no run has any
 * more, or a repository's own key for another spelling of its path. Null
 * when the URL already says so, and on any other page.
 */
export function reconciledHref(
  route: Route,
  counted: string | null,
): string | null {
  if (
    route.page !== 'factory' &&
    route.page !== 'runs' &&
    route.page !== 'compare'
  )
    return null
  const repo = counted ?? undefined
  return route.repo === repo ? null : pageHref(route.page, repo)
}
