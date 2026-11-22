# 開発と npm リリース

[README](../README.md) に戻る。

## ローカル開発と検証

```bash
pnpm install --frozen-lockfile
pnpm factory --help
pnpm validate
```

- `pnpm validate` はフォーマットチェック、lint、型チェック（ネイティブ TypeScript 7）、ユニットテスト、UI ビルドを一括で実行します。
- 実エージェントを動かす場合は、[自分のリポジトリで動かす](../README.md#自分のリポジトリで動かす) と同様に `codex login` / `claude auth login` を行ってください。
- ワーカーを起動するテストやスモーク実行では、普段の状態ディレクトリを汚さないよう [別の `HOME`](operations.md#保存先ディレクトリの構成) を指定します。
- 内部構造やチェックポイント復旧の仕組みは [アーキテクチャと制約](architecture.md) を参照してください。

## npm へのリリース手順

1. ブランチで `package.json` の `version` を更新し、PR を `main` にマージします。
2. `gh` にログイン済みの環境で `release:tag` を実行します。まず引数なしでタグ名と対象コミットを確認し、続けて `--push` 付きでタグを push します。

```bash
pnpm release:tag
pnpm release:tag --push vX.Y.Z
```

`pnpm release:tag` はリモートの `main` を取得し、`package.json` のバージョンからタグを作成します。確認時とバージョンが一致しない場合や、既存タグ・公開済みバージョン・npm 最新版以前のバージョン・CI 未通過コミットに対しては安全のため停止します。

3. GitHub Actions の [Release npm package](https://github.com/coji/durably-factory/actions/workflows/release.yml) が完了するのを待ちます。このワークフローはタグとバージョンの一致確認、テスト、tarball インストール検証を通過したうえで npm に公開します。反映後、`npx @coji/durably-factory@<version> --version` でインストールできることを確認してください。

### タグ push 後に公開が失敗した場合のリカバリ

GitHub Actions のログで原因を確認します。配布物自体に修正が必要な場合は、修正と次のバージョン上げを PR で `main` にマージし直してください。ワークフロー設定の修正や一時的なネットワーク障害であれば、修正済みの `main` から既存のタグを指定してワークフローだけを再実行できます。

```bash
gh workflow run release.yml --ref main -f tag=vX.Y.Z
```

タグの push だけが途中で失敗してローカルにタグが残った場合は、`git rev-list -n 1 vX.Y.Z` で対象コミットを確認したうえで `git push origin refs/tags/vX.Y.Z` を再実行します。公開ジョブが成功しているのに取得できない場合は、npm レジストリの反映を待ってから再確認してください。

### Trusted Publisher の設定

`@coji/durably-factory` は GitHub Actions の Trusted Publisher（OIDC）で公開します。npm 側の設定には所有者 `coji`、リポジトリ `durably-factory`、ワークフロー `release.yml`（操作: `npm publish`）を登録しています。詳細は [npm Trusted Publishers ドキュメント](https://docs.npmjs.com/trusted-publishers/) を参照してください。
