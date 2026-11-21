# Durably Factory

Durably Factory は、Codex または Claude Code に Git リポジトリの作業を任せ、テストと独立したレビューを通して結果を確認するための CLI です。エージェントは専用の Git worktree で作業します。実行の進み具合や、差分、レビューの指摘は CLI とローカルの web UI で確認できます。

## インストール

Node.js 24.22.2 以降の 24 系が必要です。まず試すなら、対象のプロジェクトに依存関係を追加せずに起動できます。

```bash
npx @coji/durably-factory@latest --version
```

プロジェクトで継続して使うなら、バージョンを固定して開発依存に入れます。`-E` を付けると、インストール時の最新版が `package.json` に固定されます。

```bash
pnpm add -D -E --allow-build=better-sqlite3 @coji/durably-factory@latest
pnpm factory --version
```

`better-sqlite3` は実行データを保存する SQLite のモジュールです。ビルドの許可は利用側の pnpm 設定に保存されます。npm の場合は `npm install -D -E @coji/durably-factory@latest` で導入し、以下の `pnpm factory` を `npm exec -- factory` に置き換えてください。

## サンプルを試す

同梱のサンプルは、エージェントへのログインなしで試せます。作業ディレクトリで次を実行します。

```bash
FAKE_FAIL_FIRST=0 FAKE_REVIEW_SEQUENCE=pass pnpm factory trigger --provider fake
```

`trigger` が返した `runId` を使って実行を確認します。

```bash
pnpm factory wait --run RUN_ID
pnpm factory waits --run RUN_ID
pnpm factory approve --run RUN_ID --wait WAIT_ID
pnpm factory report --run RUN_ID
```

`wait` は、承認待ちに入ると終了コード `2` を返します。`waits` が返した承認待ちの `id` を `WAIT_ID` に指定します。画面で進捗や結果を見たい場合は `pnpm factory ui` を実行し、表示された URL を開きます。

## 自分のリポジトリで動かす

使うエージェントをインストールし、`codex login` または `claude auth login` でログインします。対象の Git リポジトリで、作業を依頼する前に `factory.json` を用意します。次は pnpm プロジェクトで `validate` を合否判定に使う例です。

```json
{
  "base": "main",
  "setup": ["pnpm", "install", "--frozen-lockfile"],
  "check": ["pnpm", "validate"]
}
```

実際のベースブランチと、そこで動くセットアップ・テストコマンドに合わせて変更します。依頼を書いた `task.md` を渡します。

```bash
pnpm factory trigger --repo . --task-file task.md --provider codex --approve manual
pnpm factory status --run RUN_ID
pnpm factory report --run RUN_ID
```

Claude Code を使う場合は `--provider claude` に変えます。`--approve manual` を指定した実行は、テストとレビューを通過すると承認を待ちます。`waits` で承認待ちの ID を確認し、`approve` または `reject` で判断します。フラグを省略したリポジトリの実行は、承認待ちを挟まずに成果物を作ります。

結果は既定でローカルに残ります。GitHub のイシューを作業に使う場合は `--task-file` の代わりに `--issue` を使います。ブランチを push して下書き PR を作る場合は `--publish` を指定します。どちらも GitHub CLI の設定が必要です。詳しくは [リポジトリの設定](docs/configuration.md) を参照してください。

## 実行データの保存先と更新

`trigger` は必要に応じてワーカーを起動します。ワーカーは登録された作業を進めるバックグラウンドプロセスです。

SQLite の DB、ログ、実行データの既定の保存先は `~/.local/state/durably-factory/` です。プロジェクトごとに分ける場合は、CLI を使うシェルで設定します。

```bash
export DURABLY_FACTORY_STATE_DIR="$PWD/.factory-state"
pnpm factory status
```

プロジェクト内を保存先にする場合はそのディレクトリを `.gitignore` に加えます。別のターミナルから UI やワーカーを起動するときも、同じ保存先を指定してください。自動起動するワーカーには設定が引き継がれます。

Factory のバージョンを更新するときは、実行中の処理が落ち着いてから、同じ保存先で動く旧ワーカーを停止します。インストール時と同じコマンドで更新先のバージョンを指定し、`factory --version` で確認します。保存先を引き続き指定すれば、以前の実行と、その実行を準備したバージョンを report から確認できます。

## 詳しい使い方

- [日々の操作](docs/operations.md) — ワーカー、実行の状態、スリープや中断からの復旧。
- [ブラウザで見る](docs/ui.md) — 実行一覧、承認、デモデータ。
- [リポジトリの設定](docs/configuration.md) — `factory.json`、検査、実装とレビューのモデル。
- [見立て、レビュー、修正](docs/review-and-repair.md) — 修正や `recheck --onto` の使い方。
- [計測とレポート](docs/measurement.md) — 所要時間、使用量、実行の比較。
- [仕組みと制約](docs/architecture.md) — 候補の固定、権限、fake モード。
- [別のリポジトリへ移す](docs/porting.md) — ソースを別リポジトリから使う方法。

コマンド一覧は `pnpm factory --help` で見られます。問題や要望は [GitHub Issues](https://github.com/coji/durably-factory/issues) へ。ソースからの開発と npm 公開は [メンテナー向けの手順](docs/maintainer.md) を参照してください。
