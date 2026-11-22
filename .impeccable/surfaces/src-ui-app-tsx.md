---
version: 1
slug: 'src-ui-app-tsx'
primary_target: 'src/ui/App.tsx'
related_targets: ['src/ui/screens']
---

# Web UI (factory ui)

Scope: every screen of the local web UI: 工場 (overview, `#/`), タスク (list, `#/tasks`), 振り返り (`#/review`), one run (`#/runs/:id`), and the `#/design` specimen page.
Mode: Operate. 提示型 for 工場 and タスク; 探索型 for 振り返り and the run page (only the chart rules of the guidebook apply there).

Audience and job: the maintainer, glancing from a side monitor (notice waits and stops), opening to decide (approve, retry, archive), reviewing weekly (where it stuck, whether a config change helped), and showing others.
Reference: デジタル庁「ダッシュボードデザインの実践ガイドブック」(2026-03-31). Its checklist (pp. 53-55) is the acceptance list.
Throughput = tasks approved and delivered; merge is outside the factory and not recorded.

## Direction contract

THESIS: The factory read like a QC report: every finished task's lead time on an X-Rs control chart and every stop on a Pareto chart, so the constraint shows itself; refuses the category default of a status-card grid with a task table under it.
OWN-WORLD: White ground #FFFFFF on #F8F8FB, Digital Agency Blue (#0017C1 highlight block, #3460FB series, #C5D7FB secondary), Solid Gray text, Orange #FB5B01 only for limits and the constraint, Red #CE0000/#FE3939 only for stops. Hairline 1px rules, 8px radius cards, Noto Sans JP with tabular figures. At most five chart colours; every series also differs by shape or label.
STORY: Glance: how many tasks shipped this week against last week, how long they took, how many wait on me. Then: which stage holds work now and which one is the constraint. Then: which tasks fell outside the limit and why tasks stop. Act: open the task or the run.
FIRST VIEWPORT: Top bar with 工場 / タスク / 振り返り and the repository filter and update time. Top-left a blue block: delivered this week (vs last week and the 4-week mean), lead-time median (vs last week), and the 判断待ち / 止まったまま counts linking to the list. Top-right the stage strip: tasks now in each stage, the constraint stage tinted orange and named. Middle: the control chart (4/6 width) and the stop-reason Pareto (2/6). Bottom: per-stage time per task, work against wait.
FORM: QC 七つ道具 factory report, position 5 of 7 on the grounded list. seed:954ad154b3d341f7
Signature move: the control chart. Points above the upper limit turn into red triangles labelled with their task, and a click opens that task's run.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Raises kept from declined challengers

- gate board: a waiting or stopped row keeps its mark until seen, and rows do not jump between polls.
- centre rail: rules at one device pixel; text, ground and emphasis in three steps.
- developer console: reject and archive sit apart from approve.
- split-flap: columns never move on refresh; only values change.

## Open decisions

- Merge-based throughput needs a merge record the factory does not keep.
