# 日々の運用・復旧

[README](../README.md) に戻る。

## 状態の確認と次のアクション

```bash
pnpm factory status
pnpm factory status --run RUN_ID
pnpm factory report --run RUN_ID
```

引数なしの `status` は、現在進行中・人の判断待ち・エラー停止中のタスクを一覧表示し、次に実行すべきコマンドを案内します（`--format json` で機械可読形式になります）。

| 状況                                    | 実行するコマンド                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 承認待ち（または仕様の判断待ち）        | `waits --run RUN_ID` で `WAIT_ID` を確認し、`approve` または `reject` に `--run` と `--wait` を渡す |
| 最後の Candidate に追加の修正を加えたい | `repair --run RUN_ID`（[外部指摘からの修正](review-and-repair.md#外部指摘からの修正repair)）        |
| 環境を直して同じ Candidate を再検証する | `recheck --run RUN_ID`                                                                              |
| 新しいベースブランチに載せ替えて再検証  | `recheck --run RUN_ID --onto origin/main`                                                           |
| 保存済みの入力から最初からやり直す      | `retrigger --run RUN_ID`（`factory.json` を読み直す場合は `--reload-config` を付与）                |
| エージェント呼び出しの結果が不明で停止  | [スリープやワーカー停止からの復旧](#スリープやワーカー停止からの復旧)                               |

## 終了または承認待ちまで待機する（wait）

スクリプトや外部エージェントから完了を待つ場合は、ポーリングせず `wait` を使います。

```bash
pnpm factory wait --run RUN_ID
pnpm factory wait --run RUN_ID --format json
```

| 終了コード | 意味                                                        |
| ---------- | ----------------------------------------------------------- |
| `0`        | 承認および出力まで完了                                      |
| `1`        | コマンド自体のエラー（不正なフラグ、存在しない `runId` 等） |
| `2`        | 承認待ちや仕様判断待ちなど、人の入力待ち                    |
| `3`        | 失敗、却下、検証失敗、レビュー回数上限などで未完了終了      |
| `4`        | キャンセル済み                                              |
| `5`        | `--timeout` 到達                                            |
| `6`        | `--worker-timeout` の間ワーカー不在                         |

待機時間はいずれもミリ秒指定です。全体の `--timeout` はデフォルト無制限、ワーカー不在の `--worker-timeout` はデフォルト 10 秒です（`--no-worker-timeout` でワーカー不在による打ち切りを無効化できます）。

## ワーカーのライフサイクル

`trigger`、`repair`、`retrigger`、`approve`、`reject`、`spec-revise` を実行して処理可能なジョブが発生すると、ワーカーが動いていなければバックグラウンドで `worker --exit-when-idle` が自動起動します。

- 自動起動したワーカーは、承認待ち以外の処理可能なジョブがなくなってからデフォルト 30 秒で自動終了します。
- 自動起動を抑止したい場合は `--no-auto-worker` または環境変数 `DURABLY_FACTORY_NO_AUTO_WORKER=1` を指定します。待機時間は `DURABLY_FACTORY_IDLE_MS`（`1`〜`2147483647` ms）で変更できます。
- 常駐させたい場合は別ターミナルで `pnpm factory worker` を手動起動します（`--exit-when-idle --idle-ms 10000` も指定可能）。
- ワーカーは保存先ディレクトリ（state root）の `worker.lock` で排他ロックを取るため、同じ保存先に対して 2 重起動はできません（異なる保存先なら並列実行できます）。
- 自動起動ワーカーのログは `<state-dir>/logs/worker-YYYY-MM-DD.log` に追記され、PID とログパスは標準エラー出力に出ます。

## スリープやワーカー停止からの復旧

PC の短いスリープからはそのまま復帰します。ワーカーが強制終了されたりリース（10 分、1 秒ごとに更新）が切れたりした場合は、同じ保存先で `pnpm factory worker` を起動してください（または次の `trigger` 等による自動起動に任せます）。

- **完了済みの工程**: Durably のチェックポイントから結果を読み戻し、再実行しません。
- **中断した `check` コマンド**: 決定的なローカル処理のため、同じ Candidate に対して自動で再実行します。
- **結果不明の LLM 呼び出し（`uncertain-invocation`）**: 開始記録の直後にプロセスが落ちた場合、プロバイダー側で課金・実行済みかどうかを自動判定できないため、安全のため一時停止します。確認後、以下の手順で再開してください。

```bash
# 1. どの呼び出しが未確定かを確認する
pnpm factory report --run RUN_ID

# 2. プロバイダー側の履歴や worktree を確認し、残存プロセスがあれば止める
# 3. 稼働中のワーカーがあれば停止する（PID は status --run RUN_ID で確認）

# 4. 再送してよいことを確認のうえ再開する
pnpm factory resume --run RUN_ID --acknowledge-uncertain
```

## 検証失敗の分類と自動リトライ

| 分類      | ログから判定する内容                           | 挙動                                     |
| --------- | ---------------------------------------------- | ---------------------------------------- |
| `timeout` | `check` が制限時間に達した                     | コード修正に進まず即停止                 |
| `setup`   | インストール・ビルド・モジュール解決などの失敗 | コード修正に進まず即停止                 |
| `test`    | テストやアサーションの失敗                     | 上限回数までコード修正（`repair`）へ進む |
| `unknown` | 上記に分類できる手がかりがない                 | 上限回数までコード修正（`repair`）へ進む |

この分類はログからの推定手がかりです。`timeout` / `setup` で止まった場合は `check` の stdout/stderr を確認し、環境を直したうえで `recheck` や `retrigger` を行ってください。

プロバイダーが明示した混雑・レート制限エラーや、未確定呼び出しを含まない不完全なレビュー失敗については、保存済みの入力を使ってシリーズごとに `automaticRetryLimit` 回（デフォルト 1 回、`0`〜`3` で設定可能）まで自動リトライします。

## アーカイブとワークツリーの整理

対応が終わった停止 run は、アーカイブして `status` や Web UI の要対応一覧から外せます（レポート用の履歴は DB に残ります）。

```bash
pnpm factory archive --run RUN_ID
pnpm factory archive --series ROOT_RUN_ID --delete-branch
pnpm factory unarchive --run RUN_ID
```

- `--series` を指定すると、そのタスクに属するアーカイブ可能な停止 run をまとめて処理します。
- `--delete-branch` を付けると記録された `factory/*` ブランチも削除します。

完了済みまたはアーカイブ済みの run が残した worktree を一括削除するには `prune` を使います。

```bash
pnpm factory prune                          # 削除対象とサイズをドライラン確認
pnpm factory prune --apply                  # worktree を削除
pnpm factory prune --delete-branches --apply  # アーカイブ済み run のブランチも削除
```

`prune` を実行しても、SQLite の実行履歴、ログ、Candidate の差分、出力パッチは保存先に残ります。

## 保存先ディレクトリの構成

デフォルトは `~/.local/state/durably-factory/` です。環境変数 `DURABLY_FACTORY_STATE_DIR` を設定する場合は、CLI・Web UI・手動ワーカーのすべてに同じ値を渡してください。

| 保存先からのパス                                            | 内容                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `durably-factory.db`                                        | run・ステップ・試行・承認待ちの SQLite DB        |
| `worker.lock`、`worker.json`、`logs/`                       | ワーカーの排他ロック・稼働情報・ログ             |
| `runs/RUN_ID/operation-checkpoints/`                        | エージェント呼び出しと検証のチェックポイント     |
| `runs/RUN_ID/agent-logs/`、`runs/RUN_ID/verification-logs/` | エージェント出力と `check` の stdout/stderr ログ |
| `runs/RUN_ID/candidates/`、`runs/RUN_ID/delivery/`          | Candidate の差分・生成パッチ                     |

テストやスモーク実行でワーカーを起動する際は、普段の実行データを汚さないよう別の `HOME` と専用の `DURABLY_FACTORY_STATE_DIR` を指定してください。
