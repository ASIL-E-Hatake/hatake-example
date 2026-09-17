# Claude Code の設定（CLAUDE.md と .claude の作り方）

hatake の案件を AI に書かせるとき、**毎回同じ説明をしなくて済むようにする**ための設定。

置き場はこう:

```
hatake-example/
├─ CLAUDE.md                     リポジトリ全体の決めごと
└─ apps/<案件>-prj/
    ├─ CLAUDE.md                 その案件の決めごと（案件の前書きから生成した節つき）
    └─ .claude/
        ├─ settings.json         許す操作・許さない操作
        └─ commands/             定型の依頼（スラッシュコマンド）
```

Claude Code は**上のフォルダから順に CLAUDE.md を読む**ので、案件のフォルダで開けば
両方が効く。

---

## 1. 案件の CLAUDE.md を作る

手で書く部分と、**前書きから生成する部分**を分けるのがコツ。

### 手で書く部分

- この案件をどう作るか（定義で作る・ウィジェットを手で書かない）
- 守ること（`check` を通す・問いに勝手に答えない・外のものを実装しない）
- 触っていいファイル / いけないファイル

見本: [master-maintenance-prj/CLAUDE.md](../apps/master-maintenance-prj/CLAUDE.md)

### 生成する部分

案件の説明・用語・決めごと・業務ロジックの置き場は、**前書き
（`hatake.project.yaml`）にすでに書いてある**。同じことを CLAUDE.md にも手で書くと、
片方だけ直したときに必ず食い違う。

だから**前書きを正にして、CLAUDE.md に貼る側を生成する**。

まず貼る場所に印を書く（1回目は人が置く。どこに入れるかは紙を書いた人が決めるので）:

```markdown
<!-- hatake:project:begin -->
<!-- hatake:project:end -->
```

そこへ流し込む:

```bash
npx hatake project definitions/hatake.project.yaml --agents --merge CLAUDE.md
```

印の**中だけ**が入れ替わる。印の外に書いたもの（ブランチ名・レビューの回し方）は消えない。

### 古くならないようにする

前書きを直したら貼り直す。忘れると **AI が古い決めごとを読む**ので、CI で見る:

```bash
npx hatake project definitions/hatake.project.yaml --agents --check --merge CLAUDE.md
```

違っていれば終了コード 1。

> ブランチ名・コミット規約は**前書きに書かない**（定義に現れないので機械が突き合わせ
> られず、必ず腐る）。それは CLAUDE.md の印の外に手で書く。

---

## 2. `.claude/settings.json`（許す操作）

hatake の道具は**読むもの**がほとんどなので、毎回確認を求められると手が止まる。
読み取りと検証は通して、**書き換えるものと git は通さない**。

```json
{
  "permissions": {
    "allow": [
      "Bash(npx hatake check:*)",
      "Bash(npx hatake validate:*)",
      "Bash(npx hatake ask:*)",
      "Bash(npx hatake reference:*)"
    ],
    "deny": [
      "Bash(npx hatake fix:* --write)",
      "Bash(git commit:*)",
      "Bash(git push:*)"
    ]
  }
}
```

見本: [master-maintenance-prj/.claude/settings.json](../apps/master-maintenance-prj/.claude/settings.json)

**`fix --write` を通さない**のは、定義を機械が書き換えた差分を人が見ないまま進むのを
避けるため。提案までは自由にさせて、当てるのは人が見てから。

---

## 3. `.claude/commands/`（定型の依頼）

同じ依頼文を毎回打つのは続かない。`.claude/commands/<名前>.md` に置くと
`/<名前>` で呼べる。

```markdown
---
description: 前書きを読ませてから定義を書かせ、check が通るまで直させる
---

definitions/hatake.project.yaml を読んでから、$ARGUMENTS を定義に書いてください。
...
```

この案件に入れてあるのは4つ:

| | 何をするか |
|---|---|
| `/仕分け` | 資料を `hatake where --from` にかけて、枠組みの外を出す |
| `/前書き` | 前書きの下書きを起こす（**言っていないことは書かせない**） |
| `/画面` | 前書きを読ませてから定義を書かせ、`check` が通るまで直させる |
| `/検収` | `check` と `ask` と `refs` を回して、残っているものを出す |

**依頼文に毎回入れたい「守らせたいこと」をコマンド側に埋めておく**のが効く。
「助言は勝手に当てない」「問いに答えない」は、人が毎回書くのを忘れるので。

---

## 4. MCP サーバを使う場合

CLI の代わりに MCP でも引ける。`.mcp.json` に:

```json
{
  "mcpServers": {
    "hatake": {
      "command": "npx",
      "args": ["--yes", "hatake-mcp"]
    }
  }
}
```

MCP だと **AI が自分で道具を選んで引く**ので、依頼文が短くて済む
（「reference で引いて」と言わなくても引く）。
CLI は**人が結果を読みたいとき**に向いている。

---

## 作る順番（まとめ）

1. 案件の前書き（`hatake.project.yaml`）を人が書く ← **これが先**
2. `CLAUDE.md` に手書きの枠を作って、印（`<!-- hatake:project:begin -->`）を置く
3. `--merge` で流し込む
4. `.claude/settings.json` で道具を通す
5. よく使う依頼を `.claude/commands/` に切り出す
6. CI に `--check` を置いて、貼った節が古くならないようにする

1 を飛ばして CLAUDE.md に案件のことを手書きすると、**前書きと CLAUDE.md の2か所に
同じことが書かれて、必ず食い違う**。
