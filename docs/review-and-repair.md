# トリアージ・仕様・レビュー・修正

[README](../README.md) に戻る。

- 実装前のトリアージや仕様書作成を取り入れたい → [事前トリアージ](#事前トリアージprofilestriage) / [仕様の作成とレビュー](#仕様の作成とレビューspec)
- CI や人のレビュー指摘をもとに既存の Candidate を直したい → [外部指摘からの修正](#外部指摘からの修正repair)
- コードを変えずに検証・レビューだけやり直したい → [再検証](#候補を変えずに再検証するrecheck)

## 事前トリアージ（profiles.triage）

`factory.json` に `profiles.triage` を追加すると、実装前に読み取り専用のセッションでタスクと仕様を評価します。

```json
{
  "profiles": {
    "triage": { "provider": "codex", "model": "gpt-6.2-sol", "effort": "low" }
  }
}
```

トリアージは **shadow mode** で動作し、通常の実装で進められそうな `routine` か、まず試作・調査が要りそうな `probe` かの判定と理由を `status --run` とレポートの `triage` に記録します（その後の工程分岐は変えません）。出力のフォーマット不正・エラー・タイムアウト時は `unknown` として記録して実装に進みますが、プロバイダーの明示的な拒否や復旧時の未確定呼び出しがある場合は停止します。

## レビューのカスタマイズ（command / context / output）

`profiles.review.review-a` と `review-b` は、同じ Candidate 全体をそれぞれ独立してレビューします。

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

| 設定      | 値と動作                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | Claude Code に渡すスラッシュコマンド（ベースコミット側の設定を利用）。`{effort}`、`{base}`、`{head}` を展開（仕様レビューは `{head}` 不可） |
| `context` | `prompt`（既定）はプロンプト本文にレビュー資料を含める。`local-instructions` は呼び出し専用の `CLAUDE.local.md` に書き出す                  |
| `output`  | `verdict`（既定）は `DECISION` / `NOTES` をパース。`findings-json` は構造化された指摘配列をパース                                           |

- `command` と `local-instructions` は `claude` と `fake` でのみ使えます（`codex` ではエラーになります）。このモードではベースコミットの `CLAUDE.md` と `.claude/` を読み込み、Candidate は読み取り専用データとして渡されます。利用可能なツールは `Read`・`Grep`・`Glob`・`Agent` に制限され、フック・埋め込みシェル・MCP は無効です（拒否されたツール呼び出しはレポートの `permissionDenials` に記録されます）。
- `findings-json` モードでは、最後の JSON コードブロックに指摘配列を出力し、最終行に `REVIEW_STATUS: COMPLETE` を書く必要があります。各要素は `severity`（`blocker` | `non-blocker`）・`title`・`body` が必須で、`file`・`line`・`likelihood`・`impact`（1〜10）は任意です。
- 指摘が空または `non-blocker` のみなら合格です。`blocker` があれば修正へ進み、パース不能や完了行欠落時は `review-incomplete` で停止します。しきい値による `blocker` 判定の調整は [リポジトリの設定](configuration.md#blocker-のしきい値と再レビューreview) を参照してください。

## 仕様の作成とレビュー（spec）

`spec` を設定すると、リポジトリへの実装を始める前に仕様書（`spec/spec.md`）を自動生成し、名前付きレビュアーによる並列レビューと修正を回します。

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

- `template` と `reviewTemplate` は `factory.json` からの相対パスで指定し、開始時に読み込んで固定します。`fix` で省略した項目は `author` の設定を引き継ぎます。
- すでに仕様書が手元にある場合は `trigger --spec-file` で渡せます（この場合、`spec` 生成とレビューの工程はスキップされます）。

### 上限ラウンド後も blocker が残った場合

`status` や `wait` に仕様の判断待ちが表示されるので、表示された `WAIT_ID` を使って判断します。

| やりたいこと                       | コマンド                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| 現在の仕様のまま実装へ進む         | `pnpm factory approve --run RUN_ID --wait WAIT_ID`            |
| 指示メモを渡して仕様修正をやり直す | `pnpm factory spec-revise --run RUN_ID --notes-file notes.md` |
| 仕様を却下して run を終了する      | `pnpm factory reject --run RUN_ID --wait WAIT_ID`             |

`spec-revise` で渡すメモファイルは空でない UTF-8 テキスト（256 KiB まで）である必要があります。

### 仕様から検証コマンドを決める（checkFromSpec）

`spec.checkFromSpec` に `["node", "scripts/check-from-spec.mjs"]` のようにスクリプトを指定すると、確定した仕様ファイルの絶対パスを末尾の引数に付けて worktree 内で 1 回だけ実行します（`--spec-file` 指定時も動作します）。スクリプトは標準出力に次のような JSON を返す必要があります。

```json
{
  "check": ["node", "--test", "src/calc.test.js"],
  "notes": "計算処理の受け入れ条件を検証する"
}
```

返された `check` が以降のベース検証と Candidate 検証に使われ、`notes` は実装・レビュー指示およびレポートに記録されます。スクリプトの失敗や出力不正時は `spec-check-failed` で停止します（修正後は `retrigger --reload-config` でやり直します）。

## 外部指摘からの修正（repair）

CI の失敗や人によるコードレビューなど、外部で得た指摘を既存の Candidate に対して修正させるには `repair` を使います。親 run の最後の Candidate コミットから新しい子 run を作成して修正を開始し、所要時間やトークンも親に紐づけて記録します。

```bash
pnpm factory repair --run RUN_ID --findings-file findings.md
```

| 親 run の終了状態                 | `--findings-file` を省略したときの動作                        |
| --------------------------------- | ------------------------------------------------------------- |
| `approved`（承認・出力済み）      | 省略不可（`--findings-file` が必須）                          |
| `verification-failed`             | 最後に失敗した `check` コマンドの出力と終了コードから自動生成 |
| `review-cap-reached`              | 最後に修正を求めたレビューの指摘内容から自動生成              |
| `review-incomplete`（検証通過後） | 同じ Candidate に対して完了していたレビューの指摘から自動生成 |

- 親の Candidate ブランチが記録済みのコミットを指している必要があります（動いていれば `candidate-moved` で停止）。
- 親の設定を引き継いで修正から開始します（`--max-iterations 1..5` で修正回数だけ上書き可能）。
- `--dispositions-file`（対応見送り方針）や `--context-file`（確定コンテキスト）を指定すると親の設定を上書きし、省略時は親から引き継ぎます。公開設定（`--publish`）も引き継がれます。

### テストの比較基準（featureBase）と指摘ごとの回答（NOTES）

- 実装・修正担当が追加したテストは、機能追加前のコミット（`featureBase`）を基準に「バグを検出できる有効なテストか」がレビューと `testProbe` で確認されます。`repair` でも最初の親 run の `featureBase` を引き継ぎます。
- 指摘ファイルに `F1: 境界値テストを追加する` のように ID を振る（省略時は自動採番）と、修正担当は返答の `NOTES:` セクションで指摘ごとに対応を報告します。

```text
NOTES:
F1: fixed test/boundary.test.ts:25
F2: not changed — compatibility is still required
F3: disputed — the confirmed owner context requires the current behavior
```

`fixed` には変更箇所、`not changed` や `disputed` には理由が必須です。回答が不足していれば Candidate 固定前に 1 回だけ訂正を求め、それでも不足していれば停止します。また、`--dispositions-file` には `F2: non-actionable — 互換性要件を確認済み` や `F3: deferred — 別 Issue で対応` のように書けます。

### 修正スコープの限定（--scope-file）

```bash
pnpm factory repair --run RUN_ID --findings-file findings.md --scope-file scope.md
```

`scope.md`（空でない UTF-8、32 KiB まで）に今回対象外とする仕様や環境制約（例: 「仕様第 3 節は対象外。実行環境では Docker 不可」）を書くと、修正担当とレビュアーに共有されます（固定した `check` コマンド自体はそのまま実行されます）。この設定は後続の `repair` にも引き継がれます。

## 候補を変えずに再検証する（recheck）

コード修正や外部指摘を行わず、保存済みの設定のまま同じ Candidate に対して `check` とレビューだけを再実行したい場合は `recheck` を使います。

```bash
pnpm factory recheck --run RUN_ID
```

新しいベースコミット（例: 更新された `origin/main`）に変更を載せ替えたうえで検証・レビューをやり直したい場合は `--onto` を指定します。コンフリクトが発生した場合はファイル名を示して停止します（[ADR-0061](adr/0061-recheck-onto-newer-base.md)）。

```bash
pnpm factory recheck --run RUN_ID --onto origin/main
```

入力から実装そのものをやり直す場合は `retrigger` を使います（[日々の運用・復旧](operations.md)）。

## 無人実行（unattended run）のプロンプト方針

実装・修正エージェントには「人間への質問で止まらず自律的に進めること」「判断が必要な前提やスコープ外で見つけた問題は `NOTES` に残すこと」を指示しています。コーディング規約はリポジトリ内の指示ファイルから読み込み、環境セットアップ・テスト合否判定・PR 公開はすべて Factory 側が担います。

## 2 回目以降のレビューで止めてよい理由（laterRounds）

`review.laterRounds` がデフォルトの `"scoped"` のとき、レビューの回によって止めてよい理由が変わります([ADR-0062](adr/0062-later-round-review-scope.md))。

- 1 回目: 止める指摘をこの回で出し切るよう指示します。
- 修正のあとの回: 2 人のレビュアーに、前の回で止めた指摘(2 人分)と、前の回の Candidate から今の Candidate への差分ファイルを渡します。仕様レビューでは、前の回に見た版と、そこからの差分ファイルを渡します。変更の全体はこれまでどおり読めます。止めてよいのは次の場合だけです。
  - 前の回の指摘が直っていない
  - 修正の差分が持ち込んだ不具合(どこに現れたものでも)
  - 修正の差分の中の問題(仕様レビューでは、書き直した版が持ち込んだ問題)
- それ以外で新しく見つけたものは `non-blocker` として報告します。`findings-json` のレビュアーは、このルールがなければ止めていた指摘に `"laterRoundException": "outside-repair"` を付けます。レポートは回とレビュアーごとに、その数を `laterRoundNonBlockers` に残します。

レビューが止めたあとに `check` が落ちて修正が続いた場合も、差分は最後にレビューした Candidate から取ります。`check` と並行して終わり、Candidate が `check` で落ちたために数えなかったレビューは、前の回として扱いません。

レビュー上限で止まった run を `repair` で直すとき、指摘ファイルを渡さずに親のレビューから指摘を作った場合は、修正 run の最初のレビューを親の最後の回の続きとして扱います。それ以外の修正 run と `recheck` の最初のレビューは 1 回目として扱います。`reuse-experiment` の最終確認も、前の回が別の Candidate で止めていればその続きの回として扱います。

## 再レビューのセッション継続（reuse-experiment）

リポジトリ実行で `review.sessionMode: "reuse-experiment"` を設定すると、修正後の再レビュー時に前回のレビューセッションを継続して確認します。両方の継続レビューが通過した後、誤見落としを防ぐため新規セッションの 2 人で最終確認（`final`）を実施します（`parallelReview` 併用時に `check` が落ちた場合、そのラウンドの継続セッションは破棄されます）。

ただし、小規模な検証では最終確認コストを含めた API 換算費用の削減効果は確認できていないため、デフォルトは `"fresh"` のままとなっています。詳細は [レビューセッション継続の検証記録](research/review-session-experiment.md) を参照してください。
