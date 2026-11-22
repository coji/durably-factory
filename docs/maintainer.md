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

リリースは [release-please](https://github.com/googleapis/release-please) で自動化しています。人が行うのは、リリース PR の内容を確認してマージすることだけです。

1. **コミットの種類を書く。** `main` に入るコミットの題名を Conventional Commits の形にします(`feat:`、`fix:`、`docs:` など)。squash マージでは、コミットが 1 つの PR はコミットの題名が、複数の PR は PR の題名がそのまま `main` のコミットになるので、PR の題名もこの形にします。
2. **リリース PR を待つ。** `main` に push されると [Release npm package](https://github.com/coji/durably-factory/actions/workflows/release.yml) の `release-please` ジョブが、前回のリリースからのコミットを読んでリリース PR を作り、以後のマージのたびに更新します。PR には次の版の `package.json`、`.release-please-manifest.json`、`CHANGELOG.md` の変更が入ります。
   - 版の上げ方: `feat:` は minor、`fix:` などは patch です。`1.0.0` になるまでは、破壊的変更(`feat!:` や `BREAKING CHANGE:`)も minor として扱います(`bump-minor-pre-major`)。
   - `docs:`、`test:`、`ci:`、`chore:` だけでは版を上げず、CHANGELOG にも載せません。
   - 版を指定したいときは、コミット本文に `Release-As: x.y.z` を書きます。
3. **リリース PR をマージする。** release-please が `vX.Y.Z` のタグと GitHub Release を作り、同じワークフローの `build` ジョブが、タグとバージョンの一致確認、`pnpm validate`、tarball のインストール検証を通したうえで `publish` ジョブが npm に公開します。反映後、`npx @coji/durably-factory@<version> --version` でインストールできることを確認してください。

リリース PR は Actions のトークンで作られるため、その PR では CI が動きません。マージ前に確認したいときは、PR を一度閉じて開き直すか、空コミットを push してください。マージ後の公開前には `build` ジョブが同じ検証を必ず行います。

タグを手で打って push しても公開されません。版とタグは release-please だけが作ります(手で作ると `.release-please-manifest.json` とずれるため)。

### 公開が失敗した場合のリカバリ

GitHub Actions のログで原因を確認します。配布物自体に修正が必要な場合は、修正を `fix:` のコミットで `main` にマージし、次のリリース PR で出し直してください。ワークフロー設定の修正や一時的なネットワーク障害であれば、修正済みの `main` から既存のタグを指定して公開だけを再実行できます。

```bash
gh workflow run release.yml --ref main -f tag=vX.Y.Z
```

公開ジョブが成功しているのに取得できない場合は、npm レジストリの反映を待ってから再確認してください。

### Trusted Publisher の設定

`@coji/durably-factory` は GitHub Actions の Trusted Publisher（OIDC）で公開します。npm 側の設定には所有者 `coji`、リポジトリ `durably-factory`、ワークフロー `release.yml`（操作: `npm publish`）を登録しています。公開は必ずこのファイルの中で行うため、release-please も同じファイルで動かしています。詳細は [npm Trusted Publishers ドキュメント](https://docs.npmjs.com/trusted-publishers/) を参照してください。
