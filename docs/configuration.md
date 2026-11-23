# リポジトリの設定（factory.json / trigger）

[README](../README.md) に戻る。

対象リポジトリのルートに `factory.json` を配置します。最小構成で必須なのは `check`（または後述の `spec.checkFromSpec`）のみです。

```json
{
  "base": "main",
  "setup": ["pnpm", "install", "--frozen-lockfile"],
  "check": ["pnpm", "validate"]
}
```

- `check`: 合否を判定するコマンド配列（シェルを介さず先頭を実行ファイル、残りを引数として実行）。
- `setup`: worktree 作成直後に実行する準備コマンド配列（任意）。
- `base`: 作業ブランチを切る基準コミット・ブランチ（デフォルト: `HEAD`）。
- `name`: Web UI 上での表示名（省略時はディレクトリ名）。

CLI フラグで実行時に上書きしたり、挙動を調整したりできます。

```bash
pnpm factory trigger --repo . --task-file task.md --provider codex --approve manual
```

- `--check "pnpm validate"` / `--setup "pnpm install"` / `--base origin/main`: `factory.json` より優先されます。
- `--config <path>`: リポジトリルート以外の設定ファイルを使います（CLI のカレントディレクトリからの相対パス）。
- `--max-iterations <1..5>`: 1 回の run における実装と修正の合計上限回数（デフォルト: `2`）。

## タスクと入力資料の渡し方

| フラグ                | 用途                                      | 制約・補足                                                  |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `--task-file`         | タスク本文のファイル                      | `--task` / `--issue` と排他（UTF-8、256 KiB まで）          |
| `--task`              | タスク本文のインライン文字列              | 同上                                                        |
| `--issue`             | GitHub Issue 番号（`gh issue view` 取得） | 同上                                                        |
| `--spec-file`         | 確定済みの仕様書                          | UTF-8、256 KiB まで。指定時は `spec` 生成ステージをスキップ |
| `--dispositions-file` | 過去の指摘に対する方針メモ                | レビュアーのみに参照させる（UTF-8、256 KiB まで）           |
| `--context-file`      | オーナーが確定した判断や前提              | **信頼済みコンテキスト**として全ロールに渡す（32 KiB まで） |
| `--reference`         | モック HTML やスクリーンショット等        | 複数回指定可（合計 20 MiB まで、シンボリックリンク不可）    |

タスク本文や過去の指摘はエージェントの指示とは分離したデータ（untrusted input）として渡され、`--context-file` と `--reference` はリポジトリ側の確定事項（trusted context）として渡されます。

## ロール別のモデル・プロバイダー設定（profiles）

実装（`code`）、レビュー（`review-a` / `review-b`）、修正（`repair`）、事前トリアージ（`triage`）ごとに、プロバイダー・モデル・推論レベル（`effort`）を分けられます。

```json
{
  "check": ["pnpm", "validate"],
  "profiles": {
    "code": { "provider": "codex", "model": "gpt-6.2-sol", "effort": "medium" },
    "review": {
      "review-a": { "provider": "codex" },
      "review-b": { "provider": "claude" }
    }
  }
}
```

- 省略した項目は CLI の `--provider` / `--model` / `--effort` または各プロバイダーのデフォルト値で補われます。ただし、`--provider` と異なるプロバイダーを指定したロールは CLI の `--model` / `--effort` を引き継ぎません。
- `fake` プロバイダーを使う場合は、すべてのロールを `fake` に揃える必要があります。
- `profiles.triage` を指定すると、実装前のトリアージが有効になります（詳細は [トリアージ・仕様・レビュー・修正](review-and-repair.md#事前トリアージprofilestriage)）。
- レビュアー枠は `review-a` と `review-b` です（旧名称 `correctness` / `edge-cases` も互換エイリアスとして使えますが、同一枠で新旧を混在させることはできません）。

### 修正専用プロファイル（profiles.repair）とセッション継続

`profiles.repair` を設定すると、2 回目以降の修正（repair）を `code` とは別のモデルや `effort` で実行できます。省略したフィールドは `code` の解決済み設定を引き継ぎます。実質的に `code` と同じ設定になった場合は、`code` と同一扱いになります。

- デフォルトの `--context reuse` では、`code` と同じプロファイルであれば同一セッションを継続し、`--context fresh` では毎回新規セッションになります。
- `repair` プロファイルが別設定のときは原則新規セッションになりますが、**Claude Code かつ `code` と `repair` の違いが `effort` のみ**の場合（対象: Opus 5.5 / Fable 5.1 / Fable 5.2）、事前確認で同一モデルが使われると判定されればキャッシュを維持したままセッションを継続します（Bedrock / Vertex や無効化環境変数がある場合は新規セッション）。判定結果はレポートの `repairSession` に記録されます（[ADR-0024](adr/0024-local-agent-loop-claude-effort-session-reuse.md)）。
- 外部指摘から起動する `factory repair` の初回は、親のセッションを引き継がず新規セッションで開始します。

## 品質ゲートと実行速度のチューニング

### ベースコミットの事前検証（baselineCheck / baselineReuse）

- `"baselineCheck": true`: エージェントを呼ぶ前に `base` コミット上で `check` を 1 回実行し、失敗していれば `baseline-check-failed` で即停止します。壊れたベースに対してクォータを消費するのを防ぎます。このとき `setup` が `.gitignore` 対象外の未追跡ファイルを残すとエラーになり、`check` が出力した未追跡ファイルはクリーンアップされます（デフォルト: `false`）。
- `"baselineReuse": { "maxAgeMs": 3600000 }`: `baselineCheck` が有効なとき、同じ保存先にある過去 run のベース検証結果（リポジトリ、ベースコミット、コマンド、タイムアウト、Node.js バージョン、OS/アーキテクチャ、実行ファイルが一致するもの）を再利用します。上限は 7 日です。依存関係の中身や環境変数が変わる場合は期限を短くするか無効にしてください（[ADR-0025](adr/0025-local-agent-loop-baseline-reuse.md)）。

### 検証とレビューの並列実行（parallelReview）

`"parallelReview": true` にすると、固定した Candidate に対する `check` と 2 つのコードレビューを同時に開始します（デフォルトは `check` 通過後にレビューを開始）。`check` が失敗した場合、まだ送っていないレビューは送らずに終わります。すでに送ったレビューは、`review.onFailedCheck` がデフォルトの `"finish"` なら最後まで実行し、`"cancel"` ならその場でキャンセルします。答えが返ったレビューは、レビューの回数にも承認にも数えませんが、次の修正に `check` の失敗のあとで渡します(使用量はレポートに記録されます)。チェックの成果物（`checkArtifacts`）は同一ラウンドの並列レビューには間に合わないため注意してください。このフラグは `configVersion` の計算対象外です。

### コードレビューのスキップ（codeReview）

`"codeReview": false` を設定すると、Factory 側の 2 つのコードレビューを省略し、`check` を通過した時点で承認・出力段階へ進みます。リポジトリ自身のマージゲートや別 CI がコードレビューを担う構成向けです。固定の `check` と `spec` レビューは引き続き実行されます。`review.sessionMode: "reuse-experiment"` とは併用できません（[ADR-0060](adr/0060-code-review-off.md)）。

### 完了前のセルフチェック（selfCheck）

`"selfCheck": [["pnpm", "lint"], ["pnpm", "typecheck"]]` のように 1〜5 個のコマンドを指定すると、実装・修正担当に終了前の自己確認として実行を指示します。結果は自己申告としてレポートに残りますが、合否を確定するのはあくまで Factory 側の `check` です。

### Candidate 固定前の生成コマンド（generate）

`"generate": [["pnpm", "screenshots:update"]]` のように 1〜5 個のコマンドを指定すると、実装・修正で差分が生じた場合に、Candidate を固定する直前にワーカー環境で順番に実行します。生成されたファイルは Candidate に含まれます。各コマンドには環境変数 `FACTORY_RUN_ID` と `FACTORY_SPEC_PATH` が渡され、失敗時は `generate-failed` で停止します。

### 新規・変更テストのベース比較（testProbe）

```json
{
  "testProbe": [
    {
      "glob": "test/**/*.test.ts",
      "command": ["pnpm", "vitest", "run", "{files}"]
    }
  ]
}
```

実装・修正で追加または変更されたテストファイルを `base` と Candidate の両方で実行し、その結果をレビュアーに渡します（「修正前から通ってしまう空虚なテスト」を見抜くための仕組みです）。`{files}` は独立した配列要素として指定してください（[ADR-0039](adr/0039-local-agent-loop-test-probe.md)）。

### チェック成果物の共有（checkArtifacts）

`"checkArtifacts": ".factory/artifacts"` のように作業ツリー内の相対パスを指定すると、`check` 実行後にその配下の通常ファイル（合計 50 MiB まで）を Candidate ごとに保存し、`--reference` で渡した資料と見比べられるようレビュアーに渡します。

### blocker のしきい値と再レビュー（review）

- `review.blockerThreshold`（`0`〜`100` の整数、デフォルト `5`）: `findings-json` 形式のコードレビューにおいて、プロダクトの挙動に関する指摘のうち「発生頻度（`likelihood` 1〜10）× 深刻度（`impact` 1〜10）」がしきい値未満のものを `non-blocker` として扱わせます（`0` で無効化）。ただし、仕様・タスク・確定コンテキストで明示された要件の漏れや、テスト不足・スコープ・セキュリティ等の指摘には適用されません。最終判定はレビュアーが行い、しきい値未満でも `blocker` とされたものはレポートの `belowThresholdBlockers` に記録されます。
  - `local-factory.v9` 以降の run では、2 人のレビュアーに同じ「止める決まり」を渡します([ADR-0063](adr/0063-shared-blocking-rule.md))。積がしきい値以上の製品の指摘と、タスク・仕様・確定コンテキストに書かれた要件の見逃しは止めます。テストや検査の十分さについての指摘は、そのテストや検査が、タスク・仕様の受け入れ条件・確定コンテキストに書かれた失敗を見逃すときだけ止め、それ以外は `"testException": "unnamed-failure"` を付けた `non-blocker` にします。どちらのレビュアーも、この決まりにない理由で止める・止めないを決めません。レポートの `blockingRuleNonBlockers` は、回とレビュアーごとに、積がしきい値以上なのに止めなかった指摘と、止めなかったテスト・検査の指摘を数えます。
  - 既定値 `5` は今のところ変えていません。v9 の run のレポートに出る数から決め直します。
- `review.laterRounds`: デフォルトは `"scoped"` です。`findings-json` 形式のレビュアーだけが対象です。1 回目のコードレビューと仕様レビューに、止める指摘(`blocker`)をその回で出し切るよう指示します。修正のあとの回は、変更の全体を読んだうえで、止めてよいのを「前の回の `blocker` が直っていない」「修正の差分が持ち込んだ不具合」「修正の差分の中の問題」の 3 つに限り、それ以外は `non-blocker` として報告させます。`verdict` 形式のレビュアーは、NOTES が文字数に上限のある 1 行で、止める指摘の一覧にならないため、設定にかかわらずどの回も今までどおりです。`"whole"` にすると、どの回も何でも止められる今までの動きになります。run の開始時に固定され、この設定より前に保存された run とその修正 run は `"whole"` のままです([レビューと修正](review-and-repair.md#2-回目以降のレビューで止めてよい理由laterrounds)、[ADR-0062](adr/0062-later-round-review-scope.md))。
- `review.onFailedCheck`: `parallelReview` のときだけ使います。デフォルトは `"finish"` です。`check` が失敗した時点ですでに送っていたレビューを最後まで実行し、その指摘を次の修正に渡します。修正はそのレビューが終わるまで待つため、始まるのが遅れます。`"cancel"` にすると、送ったレビューもその場でキャンセルし、指摘は修正に渡りません(今までの動き)。どちらでも、まだ送っていないレビューは送りません。run の開始時に固定され、この設定より前に保存された run とその修正 run は `"cancel"` のままです([ADR-0064](adr/0064-finish-reviews-on-failed-check.md))。
- `review.sessionMode`: デフォルトは `"fresh"` です。`"reuse-experiment"` にすると再レビューで同一セッションを継続し、通過後に新規セッション 2 つで最終確認を行います（[実験結果](review-and-repair.md#再レビューのセッション継続reuse-experiment)）。

## Git コミット・承認・Draft PR 出力（commit）

```json
{
  "commit": {
    "authorName": "Factory Bot",
    "authorEmail": "factory@example.com",
    "messageTemplate": "factory: {task} ({runId} #{iteration})",
    "publishSquashed": false
  }
}
```

- `messageTemplate` では `{task}`（タスクの 1 行目）、`{runId}`、`{iteration}` が展開されます。
- 承認された run は、反復ごとのコミットを持つ `factory/<runId>`（Issue 起点なら `factory/issue-<n>-<runId>`）と、ベース上に 1 コミットへまとめた `factory/<runId>-squashed` の 2 ブランチを残します。
- `--publish` を指定すると GitHub に push して Draft PR を作成します（`commit.publishSquashed: true` の場合は `-squashed` ブランチを公開）。リポジトリ実行ではデフォルトが `--approve auto`（検証・レビュー通過で即出力）、手動承認を挟む場合は `--approve manual` を指定します。

## 事前確認（preflight）・タイムアウト・プロンプト・再実行

### 設定の事前確認（preflight）

最初のエージェント呼び出しの前に、各ロールの `provider` / `model` / `effort` の組み合わせが利用可能かを確認します。Codex はまず App Server の `model/list` で無料確認し、判断できない場合のみ最小限の呼び出しを行います。Claude は組み合わせごとに最小限の呼び出しを行い、使用量は `preflight` として集計されます。拒否された場合は設定やログインを修正してやり直します。

### タイムアウト設定

| 設定                 | リポジトリ既定 | サンプル既定 | 対応する環境変数        |
| -------------------- | -------------- | ------------ | ----------------------- |
| `agentTimeoutMs`     | 2 時間         | 5 分         | `AGENT_TIMEOUT_MS`      |
| `agentIdleTimeoutMs` | 15 分          | 5 分         | `AGENT_IDLE_TIMEOUT_MS` |
| `checkTimeoutMs`     | 15 分          | 2 分         | `TEST_TIMEOUT_MS`       |

単位はミリ秒（`1`〜`2147483647`）で、`agentIdleTimeoutMs <= agentTimeoutMs` である必要があります。優先順位は `factory.json` ＞ 起動時の環境変数 ＞ 表の既定値です。実装・修正がタイムアウトしても worktree に変更が残っていればその時点で Candidate を作って検証に進み、変更がなければ `agent-timeout` で停止します。

### Codex のネットワーク許可と CLI 固定

- `sandbox.network`: `"sandbox": { "network": ["code", "repair"] }` とすると、Codex の実装・修正ロールに対して `workspace-write` 環境での localhost 待ち受けおよび外部ネットワーク通信を許可します（レビューやトリアージには適用されません）。
- `codexPath`: 起動する Codex CLI の実行ファイルパスを指定します（`factory.json` からの相対パス可）。省略時は `PATH` 上の `codex`、次に同梱 CLI が使われます。

### 設定の固定・自動リトライ・プロンプト調整

- **設定のスナップショット**: `trigger` 時点で入力・`factory.json`・参照資料・解決済みプロファイルを DB に固定します。`factory.json` を書き換えてやり直したい場合は `pnpm factory retrigger --run RUN_ID --reload-config` を使います（`repair` や `recheck` は親の設定を引き継ぎます）。
- **自動リトライ上限（`automaticRetryLimit`）**: `0`〜`3` の整数（デフォルト `1`）。レート制限や一時的な通信失敗時、シリーズ単位で自動再試行します（[対象となる停止理由](operations.md#検証失敗の分類と自動リトライ)）。
- **ロール別プロンプト（`prompts`）**: `implement`、`repair`、`review-a`、`review-b`、`triage`、`spec-author`、`spec-fix`、`spec-review` ごとに Markdown ファイルを指定できます。例: `"prompts": { "implement": { "file": "prompts/implement.md", "mode": "append" } }`（`append` は追記、`replace` は差し替え。`factory.json` 相対パス、UTF-8、32 KiB まで）。

特定のソースコミットに固定して呼び出す運用については [チェックアウト固定と独自 Target](porting.md) を参照してください。
