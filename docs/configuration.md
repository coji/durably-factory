# 実際のリポジトリで動かす

[README](../README.md) に戻る。

対象リポジトリの直下に `factory.json` を置きます。まず、ベースのブランチ名と、そのリポジトリで合否を判定できるコマンドを決めます。

```json
{
  "base": "main",
  "setup": ["pnpm", "install", "--frozen-lockfile"],
  "check": ["pnpm", "validate"]
}
```

`check` は必須です。仕様から決める場合は [`spec.checkFromSpec`](review-and-repair.md#仕様から採点コマンドを決めるcheckfromspec) を使えます。`setup` は任意、`base` の既定値は `HEAD` です。`name` を指定すると UI にその名前が出ます。コマンドの配列はシェルを介さず、先頭を実行ファイル、残りを引数として扱います。

```bash
pnpm factory trigger --repo . --task-file task.md --provider codex --approve manual
```

`--check "pnpm validate"`、`--setup "pnpm install"`、`--base origin/main` のように指定すると、設定ファイルより優先します。`--config` で別の設定ファイルを選べます。その相対パスは CLI のカレントディレクトリから解決します。`--max-iterations` で実装と修正の合計回数を 1〜5 回に設定できます。既定は 2 回です。

## 作業の内容と資料を渡す

| 入力                               | 用途                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `--task-file`、`--task`、`--issue` | 作業そのもの。三つから一つを選ぶ。`--issue` は `gh issue view` で本文を取得する |
| `--spec-file`                      | すでに決めた仕様。実装とレビューに渡す                                          |
| `--dispositions-file`              | 過去に出た指摘と、その扱いをレビューに伝える                                    |
| `--context-file`                   | 依頼者が確定した判断や検査結果。空でない UTF-8 テキストで 32 KiB まで           |
| `--reference`                      | モック、画面写真など。ファイルやディレクトリを複数指定できる                    |

タスク、仕様、指摘の扱いをファイルで渡す場合は、それぞれ UTF-8 で 256 KiB までです。確定した判断は `--context-file` に書くと、実装とレビューで信頼できる情報として扱います。

## 役割ごとにエージェントを選ぶ

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

指定した値が優先されます。省いた項目には CLI のフラグかプロバイダーの既定値を使います。別のプロバイダーを指定した役割は、CLI の `--model` と `--effort` を引き継ぎません。`fake` を使うときは全役割を fake にそろえます。見立てを追加する場合は [`profiles.triage`](review-and-repair.md#タスクの見立てshadow-mode) を指定します。

### レビュアー名の移行（v7）

`review-a` と `review-b` は、それぞれ変更全体を独立に確認します。旧名 `correctness` と `edge-cases` も別名として使えます。設定と `prompts` では、同じ枠の新旧の名前を同時に指定できません。すでに準備を終えた run は、記録した指示と役割名で再開します。

### 再レビューのセッション（実験）

既定値は `review.sessionMode: "fresh"` です。`"reuse-experiment"` を選ぶと再レビューのセッションを継続し、合格後に新規セッション二つで最終確認します。 [実験モードの詳細](review-and-repair.md#再レビューのセッション継続実験)

## 修正だけのプロファイル（profiles.repair）

`profiles.repair` を指定すると、修正に別のモデルや推論量を使えます。省いた項目は `code` から補います。実際の設定が同じなら `code` として扱います。`--context reuse`（既定）では条件が合う場合に会話を続け、`--context fresh` では毎回新しく始めます。外部の指摘から別の実行を作る `repair` の初回は新しいセッションを使います。

## 推論量だけが違う修正では、実装のセッションを続ける（Claude）

`--context reuse` で、実装と修正がともに Claude、違いが推論量だけなら、事前確認で条件がそろったときにセッションを続けます。対象モデルは Opus 5.5、Fable 5.1、Fable 5.2 です。CLI の版と、同じモデルが実際に使われたことを確認します。Bedrock、Vertex、実験的な機能を無効にする環境変数を指定している場合は新しく始めます。レポートの `repairSession` に判定と理由が出ます。 [方式の詳細](adr/0024-local-agent-loop-claude-effort-session-reuse.md)

## 検査に時間を使う場所を決める

### ベースの採点を先に確かめる（baselineCheck）

`"baselineCheck": true` で、エージェントを呼ぶ前にベースの `check` を実行します。ベースが落ちれば `baseline-check-failed` で止まり、検査ログが残ります。`setup` は追跡済みのファイルを変更せず、無視されていない未追跡ファイルを残さないようにします。検査が作った未追跡ファイルは作業ツリーから片付けます。既定はオフです。

### ベースの採点結果を使い回す（baselineReuse）

`"baselineReuse": { "maxAgeMs": 3600000 }` は、同じ保存先に条件の合うベース検査の成功があれば使い回します。`baselineCheck` がオンの場合に使え、期限の上限は 7 日です。ベース、コマンド、制限時間、実行環境を照合します。依存パッケージの中身や環境変数が変わった場合は、期限を短くするか設定を外します。 [照合する項目](adr/0025-local-agent-loop-baseline-reuse.md)

### 検証とレビューを同時に始める（parallelReview）

`"parallelReview": true` で、同じ候補の検査と二つのレビューを同時に始めます。既定では検査が通ってからレビューを始めます。並列時に検査が失敗すると、進行中のレビューを止め、終了済みの判定は破棄します。そこまでに分かった使用量はレポートに残ります。オン・オフは `configVersion` に含まれません。検査が書き出す成果物は同じ回の並列レビューに間に合いません。

### コードのレビューをしない（codeReview）

リポジトリ側の検査がコードレビューまで行う構成では、`"codeReview": false` で Factory の二つのコードレビューを省けます。固定検査と仕様レビューは行います。再レビューの実験モードとは併用できません。 [設計記録](adr/0060-code-review-off.md)

### 終える前にエージェントに確かめさせる（selfCheck）

`"selfCheck": [["pnpm", "lint"], ["pnpm", "typecheck"]]` のように、実装担当に実行してもらうコマンドを 1〜5 個指定します。結果は自己申告としてレポートに残ります。合否は Factory が実行する `check` で決まります。

### 候補にする前に生成コマンドを実行する（generate）

`"generate": [["pnpm", "screenshots:update"]]` のように 1〜5 個指定します。実装や修正で変更があった場合に、Factory がワーカーの環境で順に実行します。生成物は候補に含まれます。各コマンドに `FACTORY_RUN_ID` と `FACTORY_SPEC_PATH` を渡し、失敗時は `generate-failed` で停止します。

### 新しいテストをベースと候補で動かす（testProbe）

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

候補が追加・変更したテストをベースと候補の両方で実行し、その結果をレビューへ渡します。`{files}` は独立した引数にし、ファイルを一つずつ渡します。検査の合否は固定の `check` が決めます。 [設計記録](adr/0039-local-agent-loop-test-probe.md)

## 参照ファイルとチェックの出力を渡す（--reference、checkArtifacts）

`--reference mock.html --reference shots/` のように指定します。参照資料は開始時にコピーし、仕様・実装・レビューの各担当へ渡します。`repair`、`recheck`、`retrigger` でも同じ資料を使います。上限は合計 20 MiB で、シンボリックリンクと名前の重複は受け付けません。

`"checkArtifacts": ".factory/artifacts"` を設定すると、検査が書いたファイルを候補ごとに保存します。通常のファイルが対象で、上限は合計 50 MiB です。作業ツリー内の相対パスを指定してください。既定の順序では実際の出力をレビューに渡せます。

## レビューの `blocker` を頻度と深刻さで決める（review.blockerThreshold）

`findings-json` を使うコードレビューでは、製品の動作に関する指摘に、起こりやすさと深刻さの積で目安を与えます。既定は 5 で、0〜100 の整数を指定できます。0 でこの目安を省きます。明示された要件や、範囲・安全性・テストに関する指摘にはこの目安を適用しません。判定を返すのはレビュアーです。積が目安を下回る `blocker` は、例外理由とあわせてレポートの `belowThresholdBlockers` で確認できます。

## コミットの作者とメッセージ（commit）

`commit.authorName` と `authorEmail` で作者を指定します。`messageTemplate` では `{task}`、`{runId}`、`{iteration}` を使えます。承認された候補は、通常の履歴に加え、変更を一つにまとめた `-squashed` ブランチにも残ります。

リポジトリを対象にした run は既定で承認待ちを挟まず、成果物をローカルに保存します。`--approve manual` で承認待ちを挟み、`--publish` で GitHub に下書き PR を作れます。`commit.publishSquashed: true` を指定した場合は、まとめたブランチを公開します。

## 設定の事前確認（preflight）

実装前に、役割で使うプロバイダー・モデル・推論量の組み合わせを確認します。Codex はまず App Server の `model/list` を読み、必要な場合だけ最小の呼び出しを行います。Claude は組み合わせごとに最小の呼び出しを行います。この使用量は `preflight` として集計します。明示的に拒否された場合は、設定やログインを直してから再実行します。

## 時間の上限

| 設定                 | リポジトリ | 同梱サンプル |
| -------------------- | ---------- | ------------ |
| `agentTimeoutMs`     | 2 時間     | 5 分         |
| `agentIdleTimeoutMs` | 15 分      | 5 分         |
| `checkTimeoutMs`     | 15 分      | 2 分         |

値はミリ秒で、1〜2147483647 の整数です。無通信の上限は呼び出し全体の上限以下にします。優先順は `factory.json`、起動時の環境変数（`AGENT_TIMEOUT_MS`、`AGENT_IDLE_TIMEOUT_MS`、`TEST_TIMEOUT_MS`）、表の既定値です。無通信の既定値は全体の上限に合わせて短くなります。

実装や修正が時間切れになっても変更が残っていれば、その時点で候補を作り、検査に進みます。変更がなければ `agent-timeout` で停止します。

## Codex でローカルサーバーを使う（sandbox.network）

`"sandbox": { "network": ["code", "repair"] }` で指定した役割にネットワークを許可します。localhost での待ち受けに加え、外部通信も許可されます。指定できるのは Codex の実装と修正です。

## Codex CLI を固定する（codexPath）

`codexPath` で CLI のファイルを指定できます。相対パスの基準は `factory.json` の場所です。絶対パスに解決し、事前確認と本番で同じファイルを使います。指定を省くと PATH 上の `codex` を優先します。実際に使った版とパスはレポートで確認できます。

## `trigger` のときに固定されるもの

実行の入力、設定、参照資料と、解決したプロファイルを保存します。設定ファイルを編集した後に新しい設定でやり直す場合は、`retrigger --run RUN_ID --reload-config` を使います。再検査や外部指摘からの修正では、親が記録した設定を引き継ぎます。

### 自動再試行の上限

`automaticRetryLimit` は保存済みの入力で行う自動再試行の上限です。0〜3 を指定でき、既定は系列ごとに 1 回です。 [対象になる停止理由](operations.md#検査失敗の分類と自動再試行)

### 役ごとのプロンプトをカスタマイズする

`prompts` で各役の Markdown を指定できます。たとえば `"prompts": { "implement": { "file": "prompts/implement.md", "mode": "append" } }` とすると、実装の既定の指示に追記します。`replace` は差し替えです。ファイルは設定ファイルからの相対パスで、空でない UTF-8 テキストを 1 件 32 KiB まで指定できます。キーは `implement`、`repair`、`review-a`、`review-b`、`triage`、`spec-author`、`spec-fix`、`spec-review` です。内容とハッシュは実行時に保存します。

## durably-factory のチェックアウトを固定して呼ぶ

ソースの特定コミットから起動する手順は [別のリポジトリで使う](porting.md) を参照してください。
