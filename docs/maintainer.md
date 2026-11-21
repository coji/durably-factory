# 開発と npm 公開

[README](../README.md) に戻る。

## ソースから動かす

```bash
pnpm install --frozen-lockfile
pnpm factory --help
pnpm validate
```

実際のエージェントを使うときは、[利用者向けの手順](../README.md#自分のリポジトリで動かす)に沿ってログインします。
ワーカーを起動するテストやスモークテストには、[普段とは別の `HOME`](operations.md) を使います。

`src/factory/job.ts` は保存された状態から次の工程を選び、`src/factory/stages.ts` が実装、検査、レビュー、承認待ちを進めます。Durably がそれぞれの判断と結果を保存し、再開時に読み戻します。実装と修正のセッションを引き継ぐ際は、Codex の `threadId` または Claude Code の `sessionId` を使います。候補の固定と再開の詳細は [仕組みと制約](architecture.md) を参照してください。

## npm に新しいバージョンを公開する

1. ブランチで `package.json` の `version` を更新します。PR を `main` にマージします。
2. `gh` にログイン済みの checkout で次を実行します。最初のコマンドは予定のタグとコミットを表示します。確認後、表示された `--push` 付きのコマンドでタグを push します。

   ```bash
   pnpm release:tag
   pnpm release:tag --push vX.Y.Z
   ```

   コマンドはリモートの `main` を取得し、その `package.json` からタグを作ります。確認時から対象バージョンが変わった場合や、同名タグ、公開済みの版、npm の最新版以前の版、CI が通っていないコミットでは停止します。

3. GitHub Actions の [Release npm package](https://github.com/coji/durably-factory/actions/workflows/release.yml) を確認します。ワークフローはタグとバージョンの一致を確かめ、テストと tarball のインストール検証を通したファイルを npm に公開します。レジストリに反映されたら、公開したバージョンを指定して `npx @coji/durably-factory@<version> --version` で確認します。

### タグを push したあとで公開に失敗した場合

Actions のログで失敗した工程を確認します。タグに含まれる配布物を変更する必要があるときは、修正と次のバージョンを PR で `main` に取り込みます。公開ワークフローだけの修正や一時的な失敗なら、修正後の `main` から既存のタグを指定して再実行できます。

```bash
gh workflow run release.yml --ref main -f tag=vX.Y.Z
```

タグの push だけが失敗し、タグが手元に残った場合は、`git rev-list -n 1 vX.Y.Z` で対象コミットを確認してから、`git push origin refs/tags/vX.Y.Z` を再実行します。公開ジョブが成功していて npm から取得できないときは、レジストリへの反映を待ちます。

### Trusted Publisher の設定

`@coji/durably-factory` は、GitHub Actions の Trusted Publisher で公開します。npm の設定で登録するのは所有者 `coji`、リポジトリ `durably-factory`、ワークフロー `release.yml` です。許可する操作は `npm publish` です。初回登録や再設定は [npm の手順](https://docs.npmjs.com/trusted-publishers/) を参照してください。
