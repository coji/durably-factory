# Durably Factory

Durably Factory は、[Durably](https://github.com/coji/durably) 上に構築したローカル実行型の Software Factory エンジンです。[artifactshare.com](https://artifactshare.com) の開発を進める中で、**Codex や Claude Code のサブスクリプション利用枠の範囲内で、開発のリードタイムとスループットを最大化する**ために作りました。

ターミナルでエージェントに対話的に指示を出し続ける運用では、Mac のスリープやセッション切れで作業が止まったり、手戻りや再レビューでクォータを浪費したりしがちです。Durably Factory は、実装・検証・独立レビュー・承認の工程を SQLite ベースの Durable Execution として分離し、バックグラウンドで確実に前へ進めます。

## なぜこの構成なのか

1. **エージェントがテストを緩められない**: エージェントは専用の Git worktree で作業し、成果物をコミット（Candidate）として固定します。合否判定には、開始時に固定したチェックコマンド（`check`）を使うため、エージェントがテスト設定を書き換えて通すことができません。
2. **2 つの独立レビューで品質を担保する**: デフォルトでは、チェックを通過した同一のコミットに対して 2 つの独立したレビュー（`review-a` / `review-b`、例: Codex と Claude）を新規セッションで実行します。修正が入れば、新しいコミットに対して検証とレビューをやり直します。
3. **途中で止まってもやり直せる**: 各ステップの完了と外部呼び出しを Durably のチェックポイントに保存します。ワーカーが停止しても完了済みステップはスキップされ、結果が不明な LLM 呼び出しだけを安全に確認・再送できます。
4. **ボトルネックを計測して最適化できる**: 実装・修正・レビューごとのトークン使用量（キャッシュ含む）、所要時間、呼び出し回数、停止理由を記録します。たとえば「Claude の利用枠が先に尽きるなら、Codex 側の実装に少し時間をかけて Claude の再レビューを 1 回減らす」といった調整の前後を `compare` コマンドで定量比較できます。どのタスクをいつ投入するかは、残りの利用枠を見ながら人が判断します。

```text
setup ─▶ [spec] ─▶ [triage] ─▶ code (worktree で実装・修正)
                                  │
                                  ▼
                               verify (固定した check コマンドで検証)
                                  │
                                  ▼
                               review (2 つの独立レビュー)
                                  │
                                  ▼
                            [approve] ─▶ finish (ブランチ / パッチ / Draft PR)
```

進捗・差分・レビュー指摘・各ステージの計測値は、CLI とローカルの Web UI（`factory ui`）から確認できます。

## インストール

Node.js 24（`24.22.2` 以降）が必要です。まずはインストールせずに動作確認できます。

```bash
npx @coji/durably-factory@latest --version
```

プロジェクトで継続して使う場合は、バージョンを固定して `devDependencies` に追加します。`-E` を付けると、インストール時のバージョンが `package.json` に固定されます。

```bash
pnpm add -D -E --allow-build=better-sqlite3 @coji/durably-factory@latest
pnpm factory --version
```

`better-sqlite3` は実行履歴を保存する SQLite ドライバです（`--allow-build` は pnpm のビルド許可設定に保存されます）。npm を使う場合は `npm install -D -E @coji/durably-factory@latest` で導入し、以降の `pnpm factory` を `npm exec -- factory` に読み替えてください。

## サンプルで流れを試す

同梱の小さな JS サンプルを使えば、エージェントへのログインなしで一連のパイプラインを体験できます。

```bash
FAKE_FAIL_FIRST=0 FAKE_REVIEW_SEQUENCE=pass pnpm factory trigger --provider fake
```

返ってきた `runId` を指定して、承認待ち・承認・レポート出力までを実行します。

```bash
pnpm factory wait --run RUN_ID
pnpm factory waits --run RUN_ID
pnpm factory approve --run RUN_ID --wait WAIT_ID
pnpm factory report --run RUN_ID
```

`wait` は承認待ちに入ると終了コード `2` で終了します。`waits` で取得した承認待ち ID を `WAIT_ID` に渡してください。Web UI で見たい場合は `pnpm factory ui` を起動します。

## 自分のリポジトリで動かす

Codex または Claude Code をインストールし、`codex login` または `claude auth login` でログインしておきます。

対象の Git リポジトリのルートに `factory.json` を作成します。`check` が必須項目です。

```json
{
  "base": "main",
  "setup": ["pnpm", "install", "--frozen-lockfile"],
  "check": ["pnpm", "validate"]
}
```

タスクを書いたファイル（または GitHub Issue）を指定して実行を登録します。

```bash
pnpm factory trigger --repo . --task-file task.md --provider codex --approve manual
pnpm factory status --run RUN_ID
pnpm factory report --run RUN_ID
```

- Claude Code を使う場合は `--provider claude` を指定します。役割ごとにプロバイダーやモデルを分ける設定は [リポジトリの設定](docs/configuration.md) を参照してください。
- `--approve manual` を付けると、検証とレビューを通過した後に承認待ちで一時停止します（`waits` で ID を確認し、`approve` または `reject` を実行）。フラグを省略した場合、リポジトリ実行では承認待ちを挟まずそのまま成果物を出力します。
- `--task-file` の代わりに `--issue 123` を渡すと `gh issue view` からタスクを取得します。`--publish` を付けるとブランチを push して Draft PR を作成します（どちらも `gh` のログインが必要です）。デフォルトではローカルにブランチとパッチだけを残します。

## 実行データの保存先とアップデート

`trigger` などを実行すると、必要な場合はバックグラウンドワーカー（`worker --exit-when-idle`）が自動起動します。

SQLite DB、worktree、ログ、レポートなどの実行データは、デフォルトで `~/.local/state/durably-factory/` に保存されます。プロジェクトごとに分離したい場合は、CLI を実行するシェルで環境変数を設定してください。

```bash
export DURABLY_FACTORY_STATE_DIR="$PWD/.factory-state"
pnpm factory status
```

プロジェクト内に置く場合は `.gitignore` に追加してください。別ターミナルから `ui` や `worker` を起動する際も同じ環境変数を指定します（自動起動するワーカーには設定が引き継がれます）。

Factory をアップデートする際は、実行中のタスクが落ち着いてから、同じ保存先で動いている旧ワーカーを停止し、インストール時と同じコマンドでバージョンを更新してください。保存先を引き継げば、過去の実行履歴やバージョンごとの比較もそのまま残ります。

## ドキュメント

- [日々の運用・復旧](docs/operations.md) — `status` / `wait`、ワーカー管理、スリープや障害からの復旧、ワークツリーの整理
- [Web UI](docs/ui.md) — ダッシュボード、ライブログ、デモデータの生成（`seed`）
- [リポジトリの設定](docs/configuration.md) — `factory.json`、役割別プロファイル、`baselineReuse`、`parallelReview`、`testProbe` など
- [トリアージ・仕様・レビュー・修正](docs/review-and-repair.md) — 事前トリアージ、仕様（`spec`）ステージ、カスタムレビュー、外部指摘からの `repair` と `recheck --onto`
- [計測・レポート・比較](docs/measurement.md) — トークン・時間・API 換算コストの計測、`report` / `compare` の見方
- [アーキテクチャと制約](docs/architecture.md) — Candidate の固定、チェックポイントと復旧、サンドボックス権限、`fake` モード
- [チェックアウト固定と独自 Target](docs/porting.md) — 特定コミットのチェックアウトで使う方法、独自の作業対象（`Target`）の実装
- [開発と npm リリース](docs/maintainer.md) — ソースからの開発、`pnpm validate`、タグ付けと公開手順

全コマンドとフラグの一覧は `pnpm factory --help` で確認できます。バグ報告や要望は [GitHub Issues](https://github.com/coji/durably-factory/issues) までお願いします。
