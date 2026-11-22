# 計測・レポート・比較

[README](../README.md) に戻る。

サブスクリプションの利用枠内でリードタイムとスループットを上げるには、**どの工程に時間やトークンを消費していて、どこで手戻りや停止が起きているか**を把握する必要があります。モデルやプロンプトを変えると、実装は速くなってもレビューの指摘が増えてトータルのリードタイムが伸びる、といったボトルネックの移動が起きるためです。

Factory はすべての呼び出しと工程を計測し、`report` で単体 run の内訳を、`compare` で設定変更前後の傾向を定量比較できるようにしています。

## 単体レポートを見る（report）

```bash
pnpm factory report --run RUN_ID
pnpm factory report --run RUN_ID --format json
pnpm factory report --run RUN_ID --format md --out report.md
```

| 確認したいこと             | レポート内の項目                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| 成功したか・手戻り回数     | `summary` の結論、修正回数（repairs）、レビュー回数（review rounds）                                   |
| どこに時間がかかったか     | 工程ごとの `work`（作業時間）と `wall`（経過時間）、承認待ち `inputWait`、順番待ち `executionSlotWait` |
| どのロールが枠を使ったか   | `roleUsage` のプロバイダー、モデル、`effort`、呼び出し回数、入力・キャッシュ・出力トークン             |
| なぜ手戻り・停止したか     | `candidates`、`check` のログ、レビュー指摘、Candidate ごとの `reviewCalls`                             |
| どの設定・バージョンで実行 | `factoryVersion`、`versions`、`configVersion`                                                          |

- `work` は工程内で動いた呼び出しの合計時間、`wall` は工程の開始から終了までの時計時間です。並列レビューのように複数エージェントが同時に動くと `work > wall` になります。run 全体のリードタイムは登録から終了までの時間です。
- トークン数はプロバイダーの報告値です。取得できなかった項目は `0` と混ぜず、`unknown`（JSON では `null`）として扱います。実際の残クォータはプロバイダー側の画面で確認し、どのタスクをいつ流すかを判断します。

## AI SDK 経由の使用量計測

Codex と Claude Code は Vercel AI SDK v7 の `generateText` 経由で呼び出し、各 CLI アダプターから共通 `usage` とネイティブの使用量メタデータを取得しています（[runner.ts](../src/engine/runner.ts)）。

- **Codex**（[codex.ts](../src/engine/providers/codex.ts)）: `ai-sdk-provider-codex-cli` 経由で App Server を利用し、完了時は `usage`、途中経過は `thread/tokenUsage/updated` から集計します。なお ChatGPT サブスクログイン時はサーバー側がキャッシュ書き込みを常に `0` で返すため、`0` は `unknown` として扱います（API キー利用時は実数として集計）。
- **Claude Code**（[claude.ts](../src/engine/providers/claude.ts)）: `ai-sdk-provider-claude-code` 経由で Claude Agent SDK を利用し、完了時はモデル別内訳（`modelUsage`）を優先します。セッション継続時は前回までの累計を差し引いて今回分を算出し、途中経過は Agent SDK メッセージから拾います。

取得した使用量と所要時間は呼び出し単位のチェックポイントに保存され、レポート生成時にロール・工程ごとに集計されます。

## 設定変更の前後を比較する（compare）

同じタスク・同じベースコミットで、モデルやセッション方針などを 1 つだけ変えて実行し、結果を並べます。

```bash
pnpm factory compare --runs RUN_A,RUN_B,RUN_C,RUN_D --format md
pnpm factory compare --trend --days 30
```

- `--runs`: `configVersion` と実行種別（通常 / `repair`）でグルーピングし、成功率・終了内訳・修正回数のほか、所要時間とトークン数の中央値・最小・最大・欠測数を表示します。`parallelReview` のオン・オフは `configVersion` に含まれないため、対象 run を分けて比較してください。
- `--trend`: 親 run と後続の `repair` run を 1 つのタスクとしてまとめ、直近 N 日間に完了した週（月曜始まり）× 初回実装のモデル・`effort` ごとに、件数・初回承認率・最終承認率・タスク合計時間・コストを算出します（実行間の空き時間は含みません。`fake` は `--include-fake` 指定時のみ含めます）。
- `cost per success` は成功した run のみを対象とした参考値です。失敗や中断で消費した分も含めて投資対効果を判断する場合は、各 run の使用量と結論を合わせて確認してください。

## 途中停止した呼び出しの扱い

キャンセル・タイムアウト・並列チェック失敗によるレビュー中止時は、その時点までに受信した最新の使用量を部分値として保存し、集計では不完全（`partial`）であることを明示します。送信前に停止した呼び出しは `not-sent` となり集計に含まれません。また、チェックポイントから結果を読み直したリプレイ時は同じ `invocationId` で重複カウントしません。

## API 換算コストと価格表のメンテナンス

レポートに表示される費用は、実行時点の単価テーブルを使って API 料金へ換算した参考値であり、サブスクリプションの請求額ではありません。価格表を更新しても、過去 run のコストは実行時に保存された単価で保持されます。

- **Codex**: ChatGPT ログインでキャッシュ書き込みが `unknown` の場合、書き込み割増コストが含まれない下限値になります。
- **Claude Code**: サブエージェントや補助モデルもモデルごとに集計し、キャッシュ書き込みは報告された TTL（5 分 / 1 時間）に応じて計算します。内訳や単価が不明な場合は `unknown` とします。
- **再レビュー**: `reviewCalls` に Candidate・ラウンド・新規/継続の別・時間・使用量を記録します（`reuse-experiment` の最終確認呼び出しも含みます）。

価格表は `src/engine/model-prices.json` で管理されています。メンテナーは `pnpm pricing:check` で差分確認、`pnpm pricing:check --write` で更新できます（GitHub Actions の `Model pricing` ワークフローも毎日単価をチェックし、差分があれば PR を自動作成します）。

## `--context reuse` と `fresh` の比較・外部台帳連携

モデル設定や実行可能なロールは `pnpm factory --help` および [設定の事前確認（preflight）](configuration.md#設定の事前確認preflight) で確認できます。セッション再利用（`--context reuse` vs `fresh`）の効果を検証したい場合は、モデル・`effort`・タスク・ベースを揃えて両者を動かし、修正回数・キャッシュ読み込みトークン・作業時間の差を `compare` で確認してください。再レビュー側のセッション継続検証については [レビューセッション継続の検証記録](research/review-session-experiment.md) に実測データがあります。

独自のスクリプトやダッシュボードへ計測データを取り込む場合は、JSON レポートから必要な項目を抽出できます。

```bash
pnpm factory report --run RUN_ID --format json \
  | jq '{runId, configVersion, delivery, roleUsage, summary}'
```
