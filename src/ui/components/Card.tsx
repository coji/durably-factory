import type { ReactNode } from 'react'

/**
 * A titled region of a dashboard: its title says what the numbers are, and
 * `kind` says how they are counted (the guidebook's data type: 30 days,
 * median, newest first), in quieter type beside it. `tools` sit at its far
 * end; `foot` carries the source or the definition under the content.
 */
export function Card({
  title,
  kind,
  tools,
  foot,
  className = '',
  children,
}: {
  title: string
  kind?: ReactNode
  tools?: ReactNode
  foot?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`border-line bg-raised flex min-w-0 flex-col rounded-lg border px-5 pt-4 pb-5 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-balance">{title}</h2>
        {kind ? <p className="text-fg-2 text-xs">{kind}</p> : null}
        {tools ? (
          <div className="ml-auto flex items-center gap-2">{tools}</div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {foot ? <div className="text-fg-2 mt-3 text-xs">{foot}</div> : null}
    </section>
  )
}
