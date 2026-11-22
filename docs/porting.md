# チェックアウト固定と独自 Target

[README](../README.md) に戻る。

通常の Git リポジトリで使うだけなら、[npm パッケージをインストール](../README.md#インストール) して `--repo` で対象リポジトリを指定するのが最も簡単です。このページでは、Factory 本体のソースコードを特定コミットに固定して運用したい場合や、Git リポジトリ以外の独自ターゲットへ組み込みたい場合の方法を説明します。

## 特定のチェックアウトを固定して呼び出す

1. `durably-factory` を任意のディレクトリに clone し、使いたいコミットをチェックアウトして `pnpm install --frozen-lockfile` を実行します。
2. 対象リポジトリのルートに `factory.json` を用意します（設定方法は [リポジトリの設定](configuration.md) を参照）。
3. 対象リポジトリ側から、固定したチェックアウトの `factory` CLI を呼び出します。

```bash
pnpm -C ~/src/durably-factory factory trigger --repo "$PWD" --task-file "$PWD/task.md"
```

- すでに同じ保存先（`DURABLY_FACTORY_STATE_DIR`）で別バージョンのワーカーが動いていると、そのワーカーがジョブを拾います。特定のチェックアウト側のワーカーで処理させたい場合は、先にそのチェックアウトからワーカーを起動するか、専用の保存先を指定してください。
- 実行履歴の DB はチェックアウトの外（`~/.local/state/durably-factory/` 等）に置かれるため、コミットを切り替えても過去の実行データは残ります。

## コードを組み込む・独自の Target を追加する

独自のパイプラインに組み込んで配布したい場合は、[`src/engine/`](../src/engine/) と [`src/factory/`](../src/factory/) を変更せずに土台として使い、[`src/targets/`](../src/targets/) 配下だけを対象に合わせて拡張します（通常の Git リポジトリ向け処理は [`src/targets/repo.ts`](../src/targets/repo.ts) にあります）。`src/targets/index.ts` に新しいターゲットを登録し、保存先や起動方法に応じて `src/durably.ts` と `src/cli.ts` を調整してください。同じマシンで既存の Factory と併用する場合は、`DURABLY_FACTORY_STATE_DIR` 等で保存先を分けます。

独自の作業対象を追加するには、[`Target`](../src/factory/target.ts) インターフェースを実装します。

| メソッド                      | 実装する責務                                                             |
| ----------------------------- | ------------------------------------------------------------------------ |
| `workdir`                     | 元のチェックアウトを汚さない独立した作業ディレクトリを提供する           |
| `seal` / `assertIntact`       | コミット SHA やコンテンツハッシュで Candidate を固定し、改変がないか検証 |
| `grade`                       | 実行開始前に確定した検証方法で合否を判定する                             |
| `reviewContext` / `reviewCwd` | 独立したレビュアーに Candidate・差分・変更ファイル一覧・規約を渡す       |
| `deliver`                     | 承認済み Candidate からパッチやブランチなどの成果物を生成・公開する      |

`TargetConfig` はワーカー再開時に DB から読み戻せるよう、純粋な JSON としてシリアライズ可能な値にしてください。実装後は `--provider fake` でパイプラインを 1 周させ、検証失敗が修正プロンプトへ正しく渡ることと、`report` に各工程が記録されることを確認してください。
