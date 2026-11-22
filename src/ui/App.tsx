/**
 * The factory's web UI: tasks that wait on a person or stopped first, then
 * open ones, then finished ones; one run's report; the finished runs by week
 * or by config version; and the design page of every component. Every value
 * is shown as the API returns it from `diagnose`, `groupTasks`,
 * `buildReport`, `trendOf` and `compareReports`; nothing is recomputed here.
 * Actions go to the server, which calls the CLI's functions; the page shows
 * what came of each as a notice and the next refresh shows the run moved.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { focusPageTitle } from './components/Layout'
import { runHref } from './components/RunLink'
import { SHELL } from './glossary'
import { parseRoute, routeKey, withFake, withRepo, type Route } from './route'
import {
  CompareScreen,
  TrendScreen,
  type CompareView,
} from './screens/CompareScreen'
import { DesignScreen } from './screens/DesignScreen'
import { FactoryScreen } from './screens/FactoryScreen'
import { PolledPage } from './screens/PolledPage'
import { RetroCharts } from './screens/RetroCharts'
import { RunScreen } from './screens/RunScreen'
import { RunsScreen } from './screens/RunsScreen'
import type {
  CompareResponse,
  RunDetailResponse,
  RunsResponse,
  TrendResponse,
} from './server'
import { useActions } from './useActions'

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useRoute(): Route {
  return parseRoute(
    useSyncExternalStore(subscribeHash, () => window.location.hash),
  )
}

/**
 * After `key` changes (not on the first load), focus the new page's h1: a
 * new route, or the summary switched to its other view, whose page replaces
 * the button that was pressed.
 */
function useFocusOnChange(key: string) {
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (previous.current !== null && previous.current !== key) focusPageTitle()
    previous.current = key
  }, [key])
}

export function App({ token }: { token: string }) {
  const route = useRoute()
  useFocusOnChange(routeKey(route))
  const { act, actMany, notice } = useActions(token, routeKey(route))
  // The summary opens on the weekly trend when the page loads; the config
  // view is a second reading of the same runs, one press away. The choice
  // lives here, above the routes, so going to another page and back keeps
  // the view last chosen until the page reloads.
  const [compareView, setCompareView] = useState<CompareView>('trend')
  // Fake tasks counted on the factory, the review and the trend, until the
  // page reloads; the switch shows only where they matter.
  const [fake, setFake] = useState(false)
  useFocusOnChange(compareView)
  // The repository the list or the summary was last narrowed to, from its
  // URL: a run's page keeps it for its links back, and writes it into its
  // own URL so a reload keeps it too.
  const [lastRepo, setLastRepo] = useState<string | undefined>(undefined)
  const repo =
    route.page === 'runs' ||
    route.page === 'compare' ||
    route.page === 'factory'
      ? route.repo
      : route.page === 'run'
        ? (route.repo ?? lastRepo)
        : lastRepo
  if (repo !== lastRepo) setLastRepo(repo)
  const runId = route.page === 'run' ? route.id : null
  const runRepo = route.page === 'run' ? route.repo : undefined
  useEffect(() => {
    if (runId !== null && repo && runRepo !== repo)
      history.replaceState(null, '', withRepo(runHref(runId), repo))
  }, [runId, runRepo, repo])
  const query = withRepo('', repo)
  // Switching repositories replaces the page, the pressed link with it.
  useFocusOnChange(query)
  // The design page reads nothing from the API, so nothing polls there.
  if (route.page === 'design') return <DesignScreen route={route} />
  // Keyed by URL, so moving to another page stops the old page's polling
  // and never shows one run's data under another's address, nor one
  // repository's list, and the tasks chosen in it, under another's.
  if (route.page === 'run') {
    const url = `/api/runs/${encodeURIComponent(route.id)}`
    return (
      <PolledPage<RunDetailResponse>
        key={url}
        route={route}
        repo={repo}
        url={url}
        back
        notice={notice}
        heading={(data) => data?.name ?? SHELL.runFallback}
        render={(data) => <RunScreen data={data} act={act} />}
      />
    )
  }
  const charts = <RetroCharts repo={repo} fake={fake} onFake={setFake} />
  if (route.page === 'compare')
    return compareView === 'trend' ? (
      <PolledPage<TrendResponse>
        key={`trend${query}${fake}`}
        route={route}
        repo={repo}
        url={withFake(`/api/trend${query}`, fake)}
        counted={(data) => data.repo}
        heading={() => SHELL.compare}
        render={(data) => (
          <TrendScreen data={data} onView={setCompareView} charts={charts} />
        )}
      />
    ) : (
      <PolledPage<CompareResponse>
        key={`compare${query}`}
        route={route}
        repo={repo}
        url={`/api/compare${query}`}
        counted={(data) => data.repo}
        heading={() => SHELL.compare}
        render={(data) => (
          <CompareScreen data={data} onView={setCompareView} charts={charts} />
        )}
      />
    )
  if (route.page === 'factory')
    return (
      <PolledPage<RunsResponse>
        key={`factory${query}`}
        route={route}
        repo={repo}
        url={`/api/runs${query}`}
        counted={(data) => data.repo}
        notice={notice}
        heading={() => SHELL.factory}
        render={(data) => (
          <FactoryScreen data={data} repo={repo} fake={fake} onFake={setFake} />
        )}
      />
    )
  return (
    <PolledPage<RunsResponse>
      key={`runs${query}`}
      route={route}
      repo={repo}
      url={`/api/runs${query}`}
      counted={(data) => data.repo}
      notice={notice}
      heading={() => SHELL.runs}
      render={(data) => <RunsScreen data={data} act={act} actMany={actMany} />}
    />
  )
}
