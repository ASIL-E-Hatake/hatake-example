#!/usr/bin/env bash
# 初見試験を回す。手元に要るのは Docker と bash だけ（Node も Chrome も要らない）。
#
#   evals/run.sh image                 … 試験の部屋と画面の殻を作る（版は hatake.version）
#   evals/run.sh start <課題> <回>      … 1回ぶんを置いて回す（コンテナは置いたまま返る）
#   evals/run.sh status                … 回っている試行
#   evals/run.sh grade <課題> <回>      … 終わった試行を採点する
#   evals/run.sh report [<版>]         … 成績表を書く（evals/results/<版>/成績表.md・前の版との比較つき）
#   evals/run.sh selftest              … 答えの定義で採点の道具を試す（AI は呼ばない）
#
# 鍵: ~/.hatake-evals.env に `CLAUDE_CODE_OAUTH_TOKEN=…`（`claude setup-token` で取る）。
#     中身は読まずに `--env-file` でコンテナに渡すだけ。
#
# 課題は evals/tasks/<課題>/（brief.md＝頼む文・task.json＝採点の表）。
# 試行は evals/.runs/<版>/<課題>/<回>/ に置く（git には入れない）:
#   seed/  作業場の初期状態（比べる用）   work/  AI の作業場（/work）
#   grade/ 採点の表（AI には見せない）    out/   記録・採点・要約
set -euo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TAG="$(tr -d '[:space:]' < "$ROOT/hatake.version")"
MODEL="${EVAL_MODEL:-claude-sonnet-5-5}"
MAX_TURNS="${EVAL_MAX_TURNS:-60}"
TIMEOUT_SEC="${EVAL_TIMEOUT_SEC:-1500}"
ENV_FILE="${EVAL_ENV_FILE:-$HOME/.hatake-evals.env}"
IMAGE="hatake-eval:$TAG"
WEB_IMAGE="hatake-eval-web:$TAG"
PUPPETEER="ghcr.io/puppeteer/puppeteer:latest"
NET="hatake-eval"
RUNS="$HERE/.runs/$TAG"

# Docker に渡す道（Git Bash では Windows の形にする）。
win() { (cd "$1" && pwd -W 2>/dev/null || pwd); }

image() {
  docker build --build-arg "TAG=$TAG" -t "$IMAGE" "$HERE/harness"
  docker build -f "$ROOT/apps/starter-prj/docker/web.Dockerfile" -t "$WEB_IMAGE" "$ROOT/apps/starter-prj"
}

trial_dir() { echo "$RUNS/$1/$2"; }
name_of() { echo "hatake-eval-${1%%-*}-$2"; }

# 作業場の初期状態: 30分サンプルの画面の殻（web/）＋空の definitions/ ＋手引きどおりに
# hatake を入れる package.json。**30分サンプルの定義と README は持ち込まない**（答えなので）。
seed() {
  local to="$1"
  mkdir -p "$to/web" "$to/definitions"
  (cd "$ROOT/apps/starter-prj/web" && tar cf - --exclude=node_modules --exclude=dist .) | (cd "$to/web" && tar xf -)
  cat > "$to/package.json" <<EOF
{
  "name": "customer-app",
  "private": true,
  "devDependencies": {
    "@hatake-fw/api": "https://github.com/ASIL-E-Hatake/hatake/releases/download/$TAG/hatake-fw-api-${TAG#v}.tgz"
  }
}
EOF
}

# task.json の extends と relax を解いて1枚にする。
resolve_task() {
  local task="$1" to="$2"
  docker run --rm -v "$(win "$HERE/tasks"):/tasks:ro" -v "$(win "$to"):/to" "$IMAGE" node -e '
    const fs = require("fs");
    const load = (name) => JSON.parse(fs.readFileSync(`/tasks/${name}/task.json`, "utf8"));
    const mine = load(process.argv[1]);
    const base = mine.extends ? load(mine.extends) : {};
    const out = { ...base, ...mine };
    out.values = (base.values ?? mine.values ?? []).map((one) => ({ ...one, ...((mine.relax ?? {})[one.name] ?? {}) }));
    fs.writeFileSync("/to/task.json", JSON.stringify(out, null, 2));
  ' "$task"
}

start() {
  local task="$1" n="$2" dir name
  [ -f "$HERE/tasks/$task/brief.md" ] || { echo "課題がありません: $task" >&2; exit 1; }
  [ -f "$ENV_FILE" ] || { echo "鍵のファイルがありません: $ENV_FILE" >&2; exit 1; }
  # 鍵の**形だけ**を見る（中身は出さない）。端末で折り返したトークンをコピーすると改行が
  # 混ざり、AI は1手も動かずに 401 で終わる＝空振りの試行が成績表に残る。
  local key
  # `#` で始まる行は Docker も読まないので数えない。
  key="$(grep -m1 '^CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2-)" || true
  if [ -z "$key" ] || [[ "$key" != sk-ant-* ]] || [[ "$key" =~ [[:space:]] ]] ||
     [ "$(grep -v -e '^#' -e '^[[:space:]]*$' "$ENV_FILE" | grep -c '')" -ne 1 ]; then
    echo "鍵の形が違います（CLAUDE_CODE_OAUTH_TOKEN=sk-ant-… の1行・改行や空白を含まない）: $ENV_FILE" >&2
    exit 1
  fi
  dir="$(trial_dir "$task" "$n")"
  name="$(name_of "$task" "$n")"
  [ -e "$dir" ] && { echo "もうあります: $dir（消してから回す）" >&2; exit 1; }
  mkdir -p "$dir/out" "$dir/grade"
  seed "$dir/seed"
  cp -r "$dir/seed" "$dir/work"
  resolve_task "$task" "$dir/grade"
  { cat "$HERE/harness/prompt.md"; cat "$HERE/tasks/$task/brief.md"; } > "$dir/out/prompt.txt"
  printf '{ "mcpServers": { "hatake": { "command": "hatake-mcp", "args": [] } } }\n' > "$dir/out/mcp.json"
  cat > "$dir/out/meta.json" <<EOF
{ "tag": "$TAG", "task": "$task", "trial": $n, "model": "$MODEL", "maxTurns": $MAX_TURNS, "timeoutSec": $TIMEOUT_SEC,
  "date": "$(date +%F)", "claude": "$(docker run --rm "$IMAGE" cat /opt/claude-version.txt)", "hatake": "$(docker run --rm "$IMAGE" cat /opt/hatake-version.txt)" }
EOF
  # 止まっている同じ名前のコンテナ（前に消した試行の残り）は片付ける。回っているものは -f
  # でないので消えない（その場合は下の run が名前の衝突で止まる）。
  docker rm "$name" > /dev/null 2>&1 || true
  # /out には採点の表を置かない（AI が読める場所なので）。採点の表は grade/ で、回す間は渡さない。
  docker run -d --name "$name" --env-file "$(cygpath -w "$ENV_FILE" 2>/dev/null || echo "$ENV_FILE")" \
    -e MODEL="$MODEL" -e MAX_TURNS="$MAX_TURNS" -e TIMEOUT_SEC="$TIMEOUT_SEC" \
    -v "$(win "$dir/work"):/work" -v "$(win "$dir/out"):/out" \
    "$IMAGE" sh -c '
      cd /work && npm install --no-audit --no-fund > /out/npm.txt 2>&1
      timeout "$TIMEOUT_SEC" claude -p --output-format stream-json --verbose \
        --model "$MODEL" --max-turns "$MAX_TURNS" \
        --mcp-config /out/mcp.json --strict-mcp-config \
        --dangerously-skip-permissions --disallowedTools WebFetch,WebSearch \
        < /out/prompt.txt > /out/transcript.jsonl 2> /out/stderr.txt
      echo $? > /out/exit.txt' > /dev/null
  echo "回しはじめました: $name（$dir）"
}

status() {
  docker ps -a --filter "name=hatake-eval-" --format '{{.Names}}\t{{.Status}}' | grep -v -- '-web-' || echo "（回っている試行はありません）"
}

grade() {
  local task="$1" n="$2" dir name web
  dir="$(trial_dir "$task" "$n")"
  name="$(name_of "$task" "$n")"
  [ -f "$dir/out/exit.txt" ] || { echo "まだ終わっていません: $name" >&2; exit 1; }
  docker rm "$name" > /dev/null 2>&1 || true

  # 殻を触っていないか（入れ直した依存と生成物は除く）。
  diff -r -q -x node_modules -x dist -x package-lock.json "$dir/seed/web" "$dir/work/web" > "$dir/out/web-diff.txt" 2>&1 || true

  # 値と報告
  docker run --rm -v "$(win "$HERE/harness"):/harness:ro" -v "$(win "$dir/work"):/work:ro" \
    -v "$(win "$dir/grade"):/task:ro" -v "$(win "$dir/out"):/out" "$IMAGE" node /harness/values.mjs

  # 画面（殻に AI の定義を載せて、ブラウザで押す）
  docker network inspect "$NET" > /dev/null 2>&1 || docker network create "$NET" > /dev/null
  web="hatake-eval-web-${task%%-*}-$n"
  docker rm -f "$web" > /dev/null 2>&1 || true
  docker run -d --name "$web" --network "$NET" \
    -v "$(win "$dir/work/definitions"):/usr/share/nginx/html/definitions:ro" "$WEB_IMAGE" > /dev/null
  mkdir -p "$dir/out/画面"
  docker run --rm --network "$NET" -v "$(win "$HERE/harness"):/harness:ro" -v "$(win "$dir/grade"):/task:ro" \
    -v "$(win "$dir/out"):/out" "$PUPPETEER" \
    sh -c "cp /harness/screen.mjs . && node screen.mjs --base http://$web:80 --task /task/task.json --out /out/画面 && mv /out/画面/screen.json /out/screen.json" || true
  docker rm -f "$web" > /dev/null

  # 記録の要約
  docker run --rm -v "$(win "$HERE/harness"):/harness:ro" -v "$(win "$dir/out"):/out" "$IMAGE" node /harness/digest.mjs /out
  docker run --rm -v "$(win "$dir/out"):/out" "$IMAGE" node -e '
    const fs = require("fs");
    const all = ["values.json", "screen.json"].flatMap((f) => fs.existsSync(`/out/${f}`) ? JSON.parse(fs.readFileSync(`/out/${f}`)).checks : []);
    const web = fs.readFileSync("/out/web-diff.txt", "utf8").trim();
    for (const c of all) console.log(`${c.ok ? "OK" : "NG"}  [${c.part}] ${c.name}${c.ok || !c.detail ? "" : `（${c.detail}）`}`);
    console.log(`${web === "" ? "OK" : "NG"}  [殻] 画面のコードを触っていない${web === "" ? "" : `（${web.split("\n")[0]}）`}`);'
}

# 版を渡すと、その版の試行から書き直す（既定は hatake.version の版）。前の版の
# summary.json が在れば「前の版との比較」が付く。
report() {
  local tag="${1:-$TAG}"
  docker run --rm -v "$(win "$HERE/harness"):/harness:ro" -v "$(win "$HERE/.runs/$tag"):/runs:ro" -v "$(win "$HERE/results"):/results" \
    "hatake-eval:$tag" node /harness/report.mjs /runs "/results/$tag/成績表.md"
}

# 採点の道具を試す（AI は呼ばない）。30分サンプルの定義（＝答え）と、それを**わざと崩した**
# 定義を置いて採点し、落ちる所が期待どおりかを見る（通るだけでは、何も見ていない道具と
# 見分けがつかない）。期待と違えば終了コード 1。
selftest() {
  local answer="$ROOT/apps/starter-prj/definitions/app.yaml" got bad=0
  # 崩し方: 「一部で」を前方一致に・区分の絞り込みを消す・10桁を20桁に・作ったあとも直せる・殻を触る
  local broken="$HERE/.runs/selftest/broken.yaml"
  mkdir -p "$HERE/.runs/selftest"
  sed -e 's/operator: contains/operator: startsWith/' \
      -e '/- { field: kind, label: 区分, type: select, operator: equals/d' \
      -e 's/{ type: maxLength, value: 10 }/{ type: maxLength, value: 20 }/' \
      -e '/readOnlyWhen: { mode: edit }/d' "$answer" > "$broken"

  one() { # <課題> <回> <定義> <殻を触る> <期待する NG（| 区切り。無ければ空）>
    local task="$1" n="$2" def="$3" touch="$4" want="$5" dir
    dir="$HERE/.runs/selftest/$task/$n"
    rm -rf "$dir" && mkdir -p "$dir/out" "$dir/grade"
    seed "$dir/seed"
    cp -r "$dir/seed" "$dir/work"
    cp "$def" "$dir/work/definitions/app.yaml"
    [ "$touch" = yes ] && echo "// 触った" >> "$dir/work/web/src/main.ts"
    resolve_task "$task" "$dir/grade"
    : > "$dir/out/transcript.jsonl"
    echo 0 > "$dir/out/exit.txt"
    got="$(RUNS="$HERE/.runs/selftest" grade "$task" "$n" | { grep '^NG' || true; } | sed -E 's/^NG  \[[^]]*\] //; s/（.*$//' | sort | paste -sd'|' -)"
    want="$(printf '%s' "$want" | tr '|' '\n' | sort | paste -sd'|' -)"
    if [ "$got" = "$want" ]; then echo "OK  $task #$n（落ちた所: ${got:-なし}）"
    else echo "NG  $task #$n"; echo "    期待: ${want:-なし}"; echo "    実際: ${got:-なし}"; bad=1; fi
  }

  one 01-顧客マスタ 1 "$answer" no ""
  one 02-外が混ざる 1 "$answer" no "報告に「作らなかったもの」がある|外と言えた: 承認|外と言えた: 月末の休眠|外と言えた: ログイン|外と言えた: メール"
  one 01-顧客マスタ 2 "$broken" yes "コード11桁は止まる|顧客名の一部で探す条件になる|区分で探す条件になる|画面で区分を絞り込める|修正ではコードを変えられない|画面のコードを触っていない"
  return $bad
}

case "${1:-}" in
  image) image ;;
  start) start "$2" "$3" ;;
  status) status ;;
  grade) grade "$2" "$3" ;;
  report) report "${2:-}" ;;
  selftest) selftest ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
