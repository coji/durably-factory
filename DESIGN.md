---
name: durably-factory
description: The local web UI of a software factory, read like a QC report on the Digital Agency dashboard palette.
colors:
  canvas: 'light-dark(#f8f8fb, #0c0d10)'
  raised: 'light-dark(#ffffff, #121318)'
  sunken: 'light-dark(#f1f1f4, #1c1e24)'
  fg: 'light-dark(#1a1a1a, #f2f2f4)'
  fg-2: 'light-dark(#626264, #b4b6bd)'
  fg-3: 'light-dark(#6b6b6d, #9a9ca3)'
  line: 'light-dark(#e6e6ea, #2a2d35)'
  line-strong: 'light-dark(#cccccc, #3a3e48)'
  focus: 'light-dark(#3460fb, #7096f8)'
  brand: 'light-dark(#0017c1, #7096f8)'
  brand-soft: 'light-dark(#e8f1fe, #1a2456)'
  highlight: 'light-dark(#0017c1, #1d2d8f)'
  on-highlight: '#ffffff'
  on-highlight-2: 'light-dark(#d9e6ff, #c5d7fb)'
  chart-1: 'light-dark(#3460fb, #7096f8)'
  chart-3: 'light-dark(#c5d7fb, #2b3a73)'
  chart-grid: 'light-dark(#e6e6ea, #2a2d35)'
  chart-axis: 'light-dark(#999999, #5a5e68)'
  limit: 'light-dark(#fb5b01, #ff8d44)'
  limit-text: 'light-dark(#ac3e00, #ffc199)'
  limit-bg: 'light-dark(#ffeee2, #3a2416)'
  stop: 'light-dark(#fe3939, #ff7171)'
  waiting: 'light-dark(#6e5600, #ffe380)'
  waiting-bg: 'light-dark(#fff7cc, #352c0c)'
  failed: 'light-dark(#ce0000, #ffbbbb)'
  failed-bg: 'light-dark(#fdeeee, #3b1a1c)'
  running: 'light-dark(#0017c1, #c5d7fb)'
  running-bg: 'light-dark(#e8f1fe, #1a2456)'
typography:
  display:
    fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '40px'
    fontWeight: 700
    lineHeight: 1
    fontFeature: 'tnum'
  headline:
    fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '28px'
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: 'tnum'
  figure:
    fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '20px'
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: 'tnum'
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '20px'
    fontWeight: 600
    lineHeight: 1.4
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.56
  card-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, sans-serif"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.33
  code:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.33
    fontFeature: 'tnum'
rounded:
  xs: '2px'
  sm: '4px'
  md: '6px'
  lg: '8px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '12': '48px'
components:
  button-primary:
    backgroundColor: '{colors.highlight}'
    textColor: '{colors.on-highlight}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '32px'
  button-secondary:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.fg-2}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '32px'
  button-secondary-hover:
    textColor: '{colors.fg}'
  button-quiet:
    textColor: '{colors.fg-2}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '32px'
  button-quiet-hover:
    textColor: '{colors.fg}'
  segments:
    backgroundColor: '{colors.sunken}'
    rounded: '{rounded.md}'
    padding: '4px'
  segment:
    textColor: '{colors.fg-2}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.sm}'
    padding: '0 12px'
    height: '32px'
  segment-current:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.fg}'
  nav-link:
    textColor: '{colors.fg-2}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '36px'
  nav-link-current:
    backgroundColor: '{colors.brand-soft}'
    textColor: '{colors.brand}'
  card:
    backgroundColor: '{colors.raised}'
    rounded: '{rounded.lg}'
    padding: '16px 20px 20px'
  highlight-block:
    backgroundColor: '{colors.highlight}'
    textColor: '{colors.on-highlight}'
    rounded: '{rounded.lg}'
    padding: '20px 24px 24px'
  badge-waiting:
    backgroundColor: '{colors.waiting-bg}'
    textColor: '{colors.waiting}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
  badge-failed:
    backgroundColor: '{colors.failed-bg}'
    textColor: '{colors.failed}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
  badge-running:
    backgroundColor: '{colors.running-bg}'
    textColor: '{colors.running}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
  badge-done:
    backgroundColor: '{colors.sunken}'
    textColor: '{colors.fg-2}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
  select:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.fg}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '0 8px'
    height: '32px'
---

# Design System: durably-factory

## Overview

**Creative North Star: "The QC Factory Report"**

The UI reads like a quality-control report on a running factory, drawn on the Digital Agency design system. The pinned reference is デジタル庁「ダッシュボードデザインの実践ガイドブック」(2026-03-31); its palette, its six-column dashboard grid and its chart rules are the system's own materials, and its checklist (pp. 53-55) is the acceptance list. The page leads with the whole flow (pace, the stage strip, the control chart, the stop-reason Pareto) and every mark leads down to a task, a run, a call.

The ground is white cards on a near-white canvas, ruled by one-pixel hairlines. A page has at most one filled region; on 工場 it is the deep blue block that carries the week's headline figures. Colour is assigned by meaning, not by decoration. Blue is the factory itself, Orange is a limit or the constraint, Yellow is a person being waited on, Red is a stop. Everything else is Solid Gray. The density is a laptop dashboard: 12-14px text, tabular figures in fixed columns, controls 32px tall, growing to 44px on touch screens.

Light and dark schemes are both first-class: every semantic token holds its pair in `light-dark()` and follows the OS; the design page shows the other scheme by setting `color-scheme` on a pane. The direction contract named Noto Sans JP for everything and light values only; the build bundles only Noto Sans JP's Latin 700 subset (about 13 KB) for headline numbers, keeps words on the system faces so the page still works offline, and ships both schemes. This file records the build.

**Key Characteristics:**

- Digital Agency palette; Blue, Orange, Yellow, Red each mean one thing.
- At most one filled blue block on a page (shipped on 工場); everything else is white cards on hairlines.
- Every chart starts at 0, uses at most five colours, and never tells series or states apart by colour alone.
- Numbers are tabular and sit in fixed, right-aligned columns that never move between polls.
- All wording comes from `src/ui/glossary.ts`; all values come from `src/ui/app.css`.

## Colors

A government-dashboard palette: Digital Agency Blue on Solid Gray, with Orange, Yellow and Red held back for the three things that need a reader.

### Primary

- **Agency Deep Blue** (`highlight`, `brand`): the factory's own colour. Fills the headline block on 工場 and the primary button, colours the current nav link (on `brand-soft`), the mean line of the control chart, the logo, and the "better than last week" change chip.
- **Agency Series Blue** (`chart-1`): the main data series in every chart (points, bars, the median line) and the focus ring's hue (`focus`).
- **Agency Pale Blue** (`chart-3`): the quiet second series, Blue 200 on light grounds: the control chart's connecting line, "その他" bars, rejected deliveries, the weekly min-max band, and the hatched waits in a time breakdown. The pale fill alone does not reach 3:1 on a card; see The Outlined Pale Rule.

### Secondary

- **Limit Orange** (`limit`, with `limit-text` for words and `limit-bg` for a tinted region): a limit and the constraint. The control chart's upper limit (dashed) and its run marks (a run of 9 or more delivered tasks on one side of the mean), the Pareto chart's cumulative line and its 80% line, the constraint lane on the factory floor (tinted, named 最も長い工程), and the same constraint in the factory's time breakdown (orange bar plus the 最も長い工程 chip). A run's own longest part is not the constraint: it keeps the `chart-1` bar and gets a bold name and a gray `sunken` tag (この実行で最も長い), never Orange.

### Tertiary

- **Stop Red** (`stop` for marks, `failed` / `failed-bg` for words and badges): a stop or a failure. The control chart's out-of-limit triangles and their task names, the stop hatch in weekly deliveries, failed and stopped badges, and the "worse than last week" change chip.
- **Waiting Yellow** (`waiting`, `waiting-bg`): a run waiting on a person. Badges, the lane count that holds a waiting task, the 判断待ち filter chip, and the hatched human-wait bar in the trace.

### Neutral

- **Canvas** (`canvas`): the page ground.
- **Raised White** (`raised`): cards, the header, buttons, the current segment, the halo behind chart labels.
- **Sunken Gray** (`sunken`): the segmented filter strip, bar tracks, the neutral `done` badge.
- **Solid Gray text** (`fg`, `fg-2`, `fg-3`): three steps: values and titles; labels, notes and axis text; empty values and column heads.
- **Hairlines** (`line`, `line-strong`, `chart-grid`, `chart-axis`): card borders and row rules; control borders; chart gridlines; the zero axis.
- **Running Blue** (`running`, `running-bg`): the running state's badge; it shares the brand hue.

### Named Rules

**The One Meaning Rule.** Blue is the factory and its series, Orange is a limit or the constraint, Yellow is a person being waited on, Red is a stop or a worse result. A colour never takes another colour's meaning, and waiting is never Orange.

**The Outlined Pale Rule.** Every `chart-3` fill, band or hatch, in a chart and in its legend swatch, carries a 1px `chart-1` outline or centre line. The outline holds 3:1 against the card; the pale fill alone does not.

**The Five Colours Rule.** One chart carries at most five colours: `chart-1`, `chart-3`, `limit`, `stop`, and gray. Each is also told apart by shape (circle against triangle), pattern (hatch), line style (solid against dashed), or a word beside it.

**The Neutral Done Rule.** Colour is for the three states that ask for attention: waiting, failed, running. A finished run, and any state that asks for nothing, is gray (`done`).

## Typography

**Display Font:** Noto Sans JP Bold, Latin subset bundled (with the system stack behind it for kana, kanji and units)
**Body Font:** the system sans stack (Hiragino Sans on macOS, with Segoe UI / Yu Gothic UI, Meiryo, Noto Sans JP, system-ui fallbacks)
**Label/Mono Font:** ui-monospace, SF Mono, Menlo, Consolas

**Character:** Numbers that lead a view are set in Noto Sans JP Bold with tabular figures; every word sits on the system sans, with hierarchy from size and weight. Monospace is only for what is literally code.

### Hierarchy

- **Display** (700, 40px, line-height 1): the two headline figures in the blue block; units (件, 時間, 分) drop to 14px medium beside the digits so "1時間37分" reads as two numbers.
- **Headline** (700, 28px): the lane counts on the factory floor and the 判断待ち / 止まったまま counts.
- **Figure** (700, 20px, line-height 1.25): the value in a metric card and the review table's figures. A run's lead time, the last row of its time-and-cost table, takes the figure face at 14px bold.
- **Title** (600, 20px): the page's one `h1`.
- **Section** (600, 16px): a section heading inside a page, with its item count beside it at 13px.
- **Card title** (600, 14px): a card's title, with its data kind (how it is counted: 30 days, median, newest first) beside it at 12px in `fg-2`.
- **Body** (400, 14px, 1.5): running text and table cells; 13px for nav, segments and dense rows.
- **Label** (400-600, 12px): axis ticks, chart labels, notes, badges, buttons, card feet.

### Named Rules

**The Tabular Rule.** Every number is set with tabular figures: times, table cells, definition values, IDs, costs, durations, counts.

**The Figure Face Rule.** Display, headline and figure numbers use the figure face (`--font-numeral`, utility `font-figure`); words never do. Only the Latin 700 subset is bundled.

**The Mono Is Code Rule.** Monospace is for IDs, paths, commands and logs only, never for a number or a label because it looks technical.

**The Glossary Rule.** No fixed word is written in a component or screen; every word comes from `src/ui/glossary.ts`. A test fails on any Japanese text found in a drawing file.

## Layout

The page is a centred column up to 88rem, padded 16px (32px from 640px). The guidebook's six-column grid with 16px gaps applies from 64rem, collapsing to one column below; cards span 2, 3, 4 or 6 columns. On 工場 the first row is the blue block (2) beside the floor (4); below it the page is two independent stacks at 2fr | 1fr (the charts; the stops and the decisions), each stacking its own cards with 16px gaps so a short card never leaves a hole beside a tall one. On 振り返り the charts pair two per row at 3 + 3, the two cards of a row at equal height. The floor's lanes auto-fit at a 6.5rem minimum. Metric grids auto-fill at 10rem.

Spacing is a 4px base (`--spacing`), used in steps of 4, 8, 12, 16, 20, 24, 32 and 48px. Fixed widths for dense columns (task meta columns, the trace inspector) are tokens in `app.css`; the task meta columns stay fixed and right-aligned from 48rem and close up below it. The trace and its axis respond to their own box with container queries (40rem, 56rem), not to the window. On a coarse pointer every control is at least 44px tall.

**The Still Columns Rule.** Columns never move on refresh; only values change.

**The No Raw Values Rule.** Components carry no hex, `rgb()`/`oklch()`, `px` value, or arbitrary type or spacing size; a test enforces it. Values live in `app.css` tokens and the Tailwind utilities named after them. Client files stay within 300 lines.

## Elevation & Depth

The system is flat. Depth is a one-pixel hairline around a white card on the near-white canvas, plus the `sunken` strip for segmented controls and bar tracks. One shadow exists, and it is for elements that float over the page (the bulk-action bar, the copy confirmation, the skip link), never for a card at rest.

### Shadow Vocabulary

- **Pop** (`box-shadow: 0 4px 12px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06)`): floating bars and transient popups only.

### Named Rules

**The Hairline Rule.** Cards and rows are separated by 1px `line` rules; a card is never lifted with a shadow.

## Shapes

Gently rounded rectangles. Cards and the blue block take 8px, buttons, selects, nav links and the segment strip 6px, badges, chips and segments 4px, chart bars 2px. Chart grid and axis lines are drawn crisp at one device pixel. Waits are hatched at 135° (4px stripes for waits; `--size-hatch-line` 2px stripes every `--size-hatch-gap` 5px for stop and provider hatches). Icons are drawn SVG in one 1.75 stroke with round caps, sized to 1em, and always decorative beside words.

## Components

### Buttons

- **Shape:** 6px corners, 32px minimum height (44px on touch), 12px horizontal padding, 12px text.
- **Primary:** `highlight` fill, white medium text: the one lead action (approve, the lead action of a run), following the Digital Agency primary button.
- **Hover / Focus:** primary fades to 85% of its fill; secondary and quiet text goes from `fg-2` to `fg`; colour transitions take 150ms. Focus is a 2px `focus` outline at 2px offset.
- **Secondary:** `raised` with a `line-strong` border, `fg-2` text.
- **Quiet:** plain text until hovered, when its border appears; used for actions that take something away (reject, archive), which sit apart from approve.
- **Disabled:** 50% opacity, not-allowed cursor.

### Chips

- **Segments:** a `sunken` strip with 4px padding holding 32px segments; the current one is `raised` with a `line-strong` border and medium weight. Used for the repository filter and the summary's two views. Under 640px the repository filter becomes a native select (44px tall, 13px text, `line-strong` border, 6px corners).
- **Change chip:** a small `raised` chip on the blue block with an arrow and words ("前週比 −4 件", "4.8 倍に悪化"); `brand` text when better, `failed` when worse, `fg-2` when the same. The arrow follows the number, the colour follows the verdict.

### Cards / Containers

- **Corner Style:** 8px.
- **Background:** `raised`.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `line`.
- **Internal Padding:** 16px top, 20px sides and bottom; title row 12px above the content; foot 12px below it.
- **Anatomy:** title, then its data kind in quieter type beside it, tools at the far end, and a foot carrying the source or definition.

### Notices

- A bordered `raised` strip (8px corners, 12px by 16px padding, 13px text) with a secondary button, as the fake-data switch on the factory and review pages.

### Inputs / Fields

- **Style:** the sort select is `raised` with a `line-strong` border, 6px corners, 32px tall, 12px text.
- **Focus:** the global 2px `focus` outline.

### Navigation

- A `raised` header with a bottom hairline, sticky from 640px and scrolling with the page on phones: the logo mark in `brand`, the product name at 14px bold, then 工場 / タスク / 振り返り as 36px links at 13px. The current page is `brand` on `brand-soft`, semibold; others are `fg-2`, gaining `sunken` on hover. The refresh time sits at the far end in 12px tabular `fg-2`.

### Status Badge

- 4px corners, 4px by 8px padding, 12px medium text, always a word. Waiting adds a drawn pause mark; running adds a dot that pulses once per 1.2s (stopped under reduced motion); failed and done carry words only.

### Headline Block (signature)

- 工場's one filled region: `highlight` ground, white text, 8px corners. Two headline figures, each with its change chip and its comparisons (last week, the 4-week mean) in `on-highlight-2`; below them an inset link row on `--highlight-inset` (12% white, 20% on hover via `--highlight-inset-hover`) with the 判断待ち and 止まったまま counts and a link to the list.

### Control Chart (signature)

- An individuals chart of delivered lead times in finish order: `chart-1` circles joined by a `chart-3` line, a solid `brand` mean, a dashed `limit` upper limit, both labelled at the right end (below the plot when narrow). A point above the limit becomes a `stop` triangle; the newest three are named beside it in `failed`. Week boundaries are dashed gridlines with week labels. Every mark is a link to the task's run and rings in `fg` on hover and focus. A week with two or more tasks above the limit gets a `failed-bg` band at 0.7 opacity across the week and a note at its top in `failed` words (11/16 の週に N 件が上限超え). A run of 9 or more delivered tasks on one side of the mean gets a 3px round-capped `limit` line at 0.6 opacity, in a strip of its own under the week labels, spanning those points, labelled 平均より上に N 点続く / 平均より下に N 点続く in `limit-text` under the line; the strip appears only when a run exists and holds no mark, so a lead time near zero never meets it. Chart labels carry a `raised` halo so they read over marks.

### Range Chart

- The Rs chart under the control chart: the range between neighbouring tasks as thin `chart-1` lines, a solid `brand` mean and a dashed `limit` upper limit, both labelled; a range above the limit turns `stop` red and is counted in `failed` words beside the note.

### Factory Floor

- Seven lanes in one hairline-ruled strip; each shows the stage name, the count now at 28px bold (`waiting` when a task waits on a person, `fg-3` at zero), what it holds in words, and the 30-day average per task under a rule. The constraint lane is tinted `limit-bg`, its text `limit-text`, and named 最も長い工程; the card foot states its share.

## Do's and Don'ts

### Do:

- **Do** give every display figure a comparison beside it: last week, the 4-week mean, a median.
- **Do** start every chart's value axis at 0, with the zero line in `chart-axis` and gridlines in `chart-grid`.
- **Do** tell series and states apart by shape, hatch, line style or a word as well as colour.
- **Do** write states in words; the waiting badge adds the pause mark, the running badge the pulsing dot.
- **Do** mark the constraint with Orange and its name (最も長い工程), never with Orange alone.
- **Do** take every value from an `app.css` token and every word from `glossary.ts`.
- **Do** keep text at 4.5:1 and chart marks at 3:1 against their ground, in both schemes (PRODUCT.md's accessibility commitment).

### Don't:

- **Don't** use Orange for a waiting state; waiting is Yellow.
- **Don't** put more than five colours on one chart.
- **Don't** use the `highlight` fill for anything but the headline block and the primary button.
- **Don't** lift a card with a shadow; the pop shadow is for floating elements.
- **Don't** set numbers, labels or headings in monospace.
- **Don't** write a hex, `rgb()`, `px` value or arbitrary text or spacing size in a component or screen file.
- **Don't** let a refresh move a column.
