# 見立て、レビュー、修正

[README](../README.md) に戻る。

- 実装前にタスクの見立てや仕様のレビューをしたい → [見立て](#タスクの見立てshadow-mode)、[仕様](#仕様を先に作ってレビューするspec)
- 残った指摘を直したい → [repair](#外部の指摘から修正するrepair)
- コードを変えずに検査とレビューをやり直したい → [recheck](#候補を変えずに検査とレビューをやり直す)

## タスクの見立て（shadow mode）

`factory.json` に `profiles.triage` を追加すると、実装前に読み取り専用のセッションでタスクと仕様を見立てます。`routine`（通常の実装で進められそう）か `probe`（まず試しに実装するとよさそう）と、その理由を記録します。判定後はどちらも同じ手順で進みます。

```json
{
  "profiles": {
    "triage": { "provider": "codex", "model": "gpt-6.2-sol", "effort": "low" }
  }
}
```

判定は `status --run` とレポートの `triage` に出ます。応答の形式違い、エラー、時間切れは `unknown` として記録し、実装に進みます。プロバイダーが呼び出しを明示的に拒否した場合や、復旧時に呼び出しの開始記録だけが残っていた場合は停止します。

## レビュー役の呼び出しと出力（command、context、output）

`profiles.review.review-a` と `profiles.review.review-b` は、それぞれ独立して同じ候補全体をレビューします。

```json
{
  "profiles": {
    "review": {
      "review-a": {
        "provider": "claude",
        "model": "claude-opus-5-5",
        "effort": "high",
        "command": "/code-review {effort} {base}...{head}",
        "context": "local-instructions",
        "output": "findings-json"
      },
      "review-b": { "provider": "codex", "output": "findings-json" }
    }
  }
}
```

| 設定      | 内容                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | Claude Code に送るレビューコマンド。ベース側に用意したコマンドを使います。展開できるのは `{effort}`、`{base}`、`{head}` です。仕様レビューでは `{head}` を省きます。 |
| `context` | `prompt`（既定）は入力にレビューの指示と資料を含めます。`local-instructions` は呼び出し専用の `CLAUDE.local.md` に置きます。                                         |
| `output`  | `verdict`（既定）は `DECISION` と `NOTES` を読みます。`findings-json` は指摘の配列を読みます。                                                                       |

`command` と `local-instructions` は Claude Code および模擬実行の `fake` で使えます。このモードでは、ベースの `CLAUDE.md` と `.claude/` を読み込み、候補のコードは読み取り専用の資料として渡します。コマンドが利用できるのは `Read`、`Grep`、`Glob`、`Agent` です。フック、埋め込みシェル、MCP は無効です。権限で拒否された操作はレポートの `permissionDenials` で確認できます。

`findings-json` は最後の JSON コードブロックに配列を置き、応答の最終行に `REVIEW_STATUS: COMPLETE` を書きます。指摘には `severity`（`blocker` または `non-blocker`）、`title`、`body` が必要です。`file`、`line`（1 以上）、`likelihood` と `impact`（各 1〜10）は任意です。値が分からない項目は省きます。

空配列または `non-blocker` のみなら合格です。`blocker` があれば修正に進み、応答が読めないか完了行がなければ `review-incomplete` で止まります。指摘はレポートの **Review rounds** に出ます。深刻さと起こりやすさから修正条件を決める場合は、[リポジトリの設定](configuration.md) を参照してください。

## 仕様を先に作ってレビューする（spec）

`spec` を設定すると、リポジトリの実装を始める前に仕様を作ります。名前を付けたレビュー役が同じ仕様を並行して読み、`blocker` があれば修正してレビューし直します。

```json
{
  "spec": {
    "template": "docs/spec-template.md",
    "reviewTemplate": "docs/spec-review.md",
    "maxRounds": 3,
    "author": {
      "provider": "claude",
      "model": "claude-opus-5-5",
      "effort": "high"
    },
    "fix": { "effort": "medium" },
    "review": {
      "product": { "provider": "codex", "output": "findings-json" },
      "tech": { "provider": "claude", "output": "findings-json" }
    }
  }
}
```

テンプレートのパスは `factory.json` からの相対パスです。開始時に中身を保存します。`fix` で省いた設定は `author` から補います。レビューは既定で 3 回までです。手元に完成した仕様があるときは `trigger --spec-file` で渡せます。その場合は仕様を作る工程とレビューを省きます。

### 上限の回まで直らなかったとき

`status` や `wait` に「仕様の判断待ち」が出ます。表示された待ち ID を使います。

| 操作                                             | コマンド                                                 |
| ------------------------------------------------ | -------------------------------------------------------- |
| この仕様で実装する                               | `factory approve --run RUN_ID --wait WAIT_ID`            |
| メモを渡して、仕様の修正とレビューをもう一度行う | `factory spec-revise --run RUN_ID --notes-file notes.md` |
| 仕様を却下して終了する                           | `factory reject --run RUN_ID --wait WAIT_ID`             |

修正後も `blocker` が残れば、再び判断を待ちます。`spec-revise` のメモは空でない UTF-8 テキストで、上限は 256 KiB です。

### 仕様から採点コマンドを決める（checkFromSpec）

例として、`spec.checkFromSpec` に `["node", "scripts/check-from-spec.mjs"]` を設定します。Factory は確定した仕様の絶対パスを最後の引数に足し、作業ツリーで一度だけ実行します。`--spec-file` で渡した仕様も使えます。

標準出力には、実行するコマンドを引数の配列で返します。`notes` は任意で、実装とレビューの指示、レポートに記録されます。

```json
{
  "check": ["node", "--test", "src/calc.test.js"],
  "notes": "計算処理の受け入れ条件を検査する"
}
```

この `check` を事前の検査と候補の検査に使います。スクリプトが失敗するか出力が読めなければ、`spec-check-failed` で止まります。スクリプトを直したら、`retrigger --reload-config` で新しい実行を始めます。

## 外部の指摘から修正する（repair）

CI や人のレビューなどで見つかった指摘を渡すと、最後の候補から修正を始められます。所要時間や使用量は、元の実行にひもづく新しい実行としてレポートに出ます。

```bash
factory repair --run RUN_ID --findings-file findings.md
```

| 元の実行                         | `--findings-file` を省いた場合                     |
| -------------------------------- | -------------------------------------------------- |
| 承認、納品まで完了               | 指摘ファイルが必要です。                           |
| `verification-failed`            | 最後の候補で失敗した検査の記録を使います。         |
| `review-cap-reached`             | 最後の候補で修正を求めたレビューの指摘を使います。 |
| 検査成功後の `review-incomplete` | 同じ候補に対して完了したレビューの指摘を使います。 |

候補のブランチは、記録済みのコミットを指している必要があります。保存された指摘を取得できない場合は `--findings-file` を渡します。子の実行は元の設定を引き継ぎ、修正から始めます。`--max-iterations`（1〜5）を指定すると、その実行の修正回数を変更できます。

- `--dispositions-file` で、対応を見送る指摘と理由を渡します。省略すると元の指定を引き継ぎます。
- `--context-file` で、リポジトリの管理者が確認した製品上の決定を渡します。省略すると元の確定した文脈を引き継ぎます。
- 公開設定も元の実行から引き継ぎます。元の変更がまだマージされていない場合、下書き PR にはその変更も含まれます。

## 修正したテストを比べる基準

修正担当には、依頼された振る舞いを確かめるテストを書くよう指示します。レビューと `testProbe` では、機能を入れる前のコミット（`featureBase`）を基準に、新しいテストが不具合を見つけられるかを確かめます。`repair` はこの基準を最初の実行から引き継ぎます。修正の差分は、直前の候補から取ります。

依頼された振る舞いを確かめる有効なテストがなければ、修正を求める指摘の対象です。過剰に広いテストは `non-blocker` として報告します。

## findingごとの処置を返させる

指摘ファイルには `F1: 境界値のテストを追加する` のように ID を付けられます。省略した指摘には Factory が番号を振ります。修正担当は指摘ごとに対応を報告します。

```text
NOTES:
F1: fixed test/boundary.test.ts:25
F2: not changed — compatibility is still required
F3: disputed — the confirmed owner context requires the current behavior
```

`fixed` には変更箇所、`not changed` と `disputed` には理由が必要です。回答が足りなければ候補の確定前に一度だけ訂正を求め、それでも不足していれば止まります。回答と訂正はレポートの `codeResponses` に出ます。実際の修正内容はレビューで確かめます。検査ログだけから修正を始めた場合は、指摘単位の回答を省きます。

`--dispositions-file` で対応しない指摘を伝える場合は、`F2: non-actionable — 互換性の要件を確認済み` や `F3: deferred — 別のイシューで扱う` と書きます。

## この修正で扱う範囲を変える

```bash
factory repair --run RUN_ID --findings-file findings.md --scope-file scope.md
```

`scope.md` に、今回対象外とする仕様の節や実行環境の制約を書きます。例えば「仕様の第 3 節は対象外。実行環境で Docker は使えない」と指定できます。修正担当とレビュアーが読み、固定した検査はそのまま実行します。

ファイルは空でない UTF-8 テキストで、上限は 32 KiB です。内容は開始時に保存され、次の `repair` にも引き継がれます。別の `--scope-file` で置き換えられます。

## 候補を変えずに検査とレビューをやり直す

```bash
factory recheck --run RUN_ID
```

`repair` と同じ条件を満たす候補で、検査と設定済みのレビューをやり直します。保存済みの設定を使い、コードの修正は行いません。承認方針は元の実行から引き継ぎ、成果物はローカルに残します。入力から実装もやり直すときは、[retrigger](operations.md) を使います。

### 新しいbaseの上で検査とレビューをやり直す

```bash
factory recheck --run RUN_ID --onto origin/main
```

元のベースから候補までの変更を指定したコミットに載せ、できた候補を検査します。競合があればファイル名を示して止まります。元のベースを使う場合は `--onto` を省きます。 [ADR-0061](adr/0061-recheck-onto-newer-base.md)

## 無人runのプロンプト方針

実装と修正の担当は質問への返答を待たずに進めます。判断が必要になったときに置いた前提や、依頼の範囲外で見つけた問題は `NOTES` に残します。チームのコーディング規約はリポジトリの指示ファイルから読み、セットアップ、合否判定、公開は Factory が行います。

## 再レビューのセッション継続（実験）

既定では、候補が変わるたびに新しいセッションでレビューします。リポジトリの実行で `review.sessionMode: "reuse-experiment"` を設定すると、2 人がそれぞれのセッションで再レビューします。修正後はその時点の候補全体を読み直します。

継続レビューが両方通ったら、新しいセッションの 2 人が同じ候補を最終確認します。`parallelReview` と併用して検査が落ちた場合は、その回の継続セッションを破棄します。

レポートの `reviewCalls` には再レビュー（`iterative`）と最終確認（`final`）が出ます。小規模な実験では、最終確認を含めた使用量の削減は確認できませんでした。 [実 CLI での検証結果と再現手順](research/review-session-experiment.md)
