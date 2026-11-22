import { useState } from 'react'

import { DoneFilters } from '../list/DoneTasks'

/** The finished list's filter and archived switch, working on their own. */
export function FilterStates() {
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DoneFilters
        query={query}
        onQuery={setQuery}
        archived={archived}
        onArchived={setArchived}
        archivedCount={12}
      />
    </div>
  )
}
