# ソースを固定して使う・組み込む

[README](../README.md) に戻る。

既存の Git リポジトリを対象にする場合は、[npm 版をインストール](../README.md#インストール)し、そのリポジトリを `--repo` で指定できます。このページでは、Factory 自体の変更を試す場合と、独自の作業対象を追加する場合を説明します。

## checkoutを固定して呼ぶ

1. durably-factory を clone し、使うコミットをチェックアウトします。`pnpm install --frozen-lockfile` を実行します。
2. 対象のリポジトリに `factory.json` を置きます。検査と役割の指定は [リポジトリの設定](configuration.md) を参照してください。
3. 対象リポジトリから、固定したチェックアウトの Factory を呼び出します。

   ```bash
   pnpm -C ~/src/durably-factory factory trigger --repo "$PWD" --task-file "$PWD/task.md"
   ```

処理を担当するのは、同じ保存先ですでに動いているワーカーです。固定した版を使うときは、そのチェックアウトからワーカーを起動するか、専用の保存先を設定します。履歴はチェックアウトの外にあるので、版を切り替えても同じ保存先から読めます。

## コードをコピーする

Factory と対象プロジェクトを一緒に変更・配布するなら、[`src/engine/`](../src/engine/) と [`src/factory/`](../src/factory/) を土台にします。通常の Git リポジトリを扱う処理は [`src/targets/repo.ts`](../src/targets/repo.ts) にあります。`src/targets/index.ts` で対象を登録し、`src/durably.ts` と `src/cli.ts` を、保存先と起動方法に合わせて調整します。同じマシンで既存の Factory と併用するなら、保存先を分けます。

## 新しい Target を書く場合

[`Target`](../src/factory/target.ts) で、作業する場所、候補の固定、検査、レビュー資料、成果物を定義します。

| 関数                          | 実装すること                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `workdir`                     | 現在のチェックアウトと分けた作業場所を用意する。                 |
| `seal` / `assertIntact`       | コミットやハッシュで候補を識別し、各工程で同じ版を確かめる。     |
| `grade`                       | 実装前に確定した検査で合否を判定する。                           |
| `reviewContext` / `reviewCwd` | 候補、ベースからの差分、変更ファイルを独立したレビュアーに渡す。 |
| `deliver`                     | 承認した候補からパッチやブランチなどの成果物を作る。             |

`TargetConfig` は再開時に読み戻せる JSON の値にします。組み込み後は `--provider fake` で一周させ、検査失敗が修正担当に届くことと、レポートに工程が出ることを確認します。
