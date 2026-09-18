#!/usr/bin/env bash
# テストを全部回して、**納品用の記録**を作り直す（案件をまたいで使い回す版）。
#
#   bash tools/run-tests.sh            … 全部
#   bash tools/run-tests.sh scenarios  … 値だけ（動いている環境が要らない）
#   bash tools/run-tests.sh api        … API だけ
#   bash tools/run-tests.sh screen     … 画面だけ（スクリーンショット）
#
# 出てくるもの（docs/4-テスト/）:
#   出力-シナリオ結果.txt      値の合否（hatake run）
#   出力-試していない所.txt    まだ試していない分岐（hatake run --cover）
#   出力-APIテスト結果.md      API の実行記録（投げたもの／返ってきたもの）
#   出力-画面テスト結果.md     画面の記録（項番 → スクリーンショット）
#   画面/*.png                 スクリーンショット本体
#
# **api と screen は動いている環境が要る**（`docker compose up`）。
#
# 回す前に**データを初期状態に戻す**。エビデンスは「何度回しても同じ」でないと使えない
# （一括の試験が前回の続きから始まると、2回目から結果が変わる＝1本目で実際そうなった）。
#
# 案件ごとに違うところは `tools/test.config.sh` に書く（DB の名前・画面の URL・
# 値の試験を回す画面の並び）。案件側の `tools/run-tests.sh` はここを呼ぶだけ。
set -uo pipefail

HATAKE="${HATAKE:-npx --yes hatake}"
DEF=definitions/app.yaml
OUT="docs/4-テスト"
WHAT="${1:-all}"
fail=0

# --- 案件ごとの設定 ---------------------------------------------------------
# 既定は1本目の形。合わないものだけ案件側で上書きする。
SCENARIO_PAGES=""
DB_NAME=""
API_BASE="http://localhost:3000/api"
SCREEN_NETWORK=""
SCREEN_BASE="http://web:80"
# shellcheck source=/dev/null
[ -f tools/test.config.sh ] && . tools/test.config.sh

mkdir -p "$OUT"

run_scenarios() {
  echo "== 値のテスト（hatake run）"
  : > "$OUT/出力-シナリオ結果.txt"
  : > "$OUT/出力-試していない所.txt"
  for page in $SCENARIO_PAGES; do
    {
      echo "### $page"
      $HATAKE run "$DEF" --page "$page" --scenario "tests/scenarios/$page.json" 2>&1
      echo
    } >> "$OUT/出力-シナリオ結果.txt" || fail=1
    {
      echo "### $page"
      $HATAKE run "$DEF" --page "$page" --scenario "tests/scenarios/$page.json" --cover 2>&1 \
        | sed -n '/まだ試していない/,$p'
      echo
    } >> "$OUT/出力-試していない所.txt"
  done
  grep -c "^OK" "$OUT/出力-シナリオ結果.txt" | sed 's/^/   通った件数: /'
}

# データを初期状態に戻す（この案件の DB は使い捨て。永続化していない）。
reset_data() {
  echo "== データを初期状態に戻す"
  # `--renew-anon-volumes` が要る。postgres の image は data ディレクトリを
  # ボリュームとして宣言しているので、**作り直しても中身が残る**＝初期データの
  # SQL が走らない（空のときだけ走る仕掛けなので）。
  docker compose up -d --force-recreate --renew-anon-volumes db >/dev/null 2>&1 || return 1
  for _ in $(seq 1 30); do
    docker compose exec -T db pg_isready -U hatake -d "$DB_NAME" >/dev/null 2>&1 && break
    sleep 1
  done
  # API は起動時に DB を掴んでいるので、繋ぎ直させる。
  docker compose restart api >/dev/null 2>&1
  sleep 5
}

run_api() {
  echo "== API のテスト"
  node tests/api/run.mjs --base "$API_BASE" \
    --out "$OUT/出力-APIテスト結果.md" || fail=1
}

run_screen() {
  echo "== 画面のスクリーンショット"
  # Chrome が入った使い捨てのコンテナで撮る（**手元に Chrome を入れさせない**）。
  # 画面のコンテナと同じネットワークに入れて、名前で呼ぶ。
  # Windows の Git Bash は `pwd` が /c/... を返すので、Docker に渡せる形にする。
  local here; here="$(pwd -W 2>/dev/null || pwd)"
  MSYS_NO_PATHCONV=1 docker run --rm --network "$SCREEN_NETWORK" -v "$here:/prj" \
    ghcr.io/puppeteer/puppeteer:latest \
    sh -c "cp /prj/tests/screen/shots.mjs /home/pptruser/ && cd /home/pptruser && \
           node shots.mjs --base '$SCREEN_BASE' --shots '/prj/$OUT/画面' --out '/prj/$OUT/出力-画面テスト結果.md'" \
    || fail=1
}

case "$WHAT" in
  all)       run_scenarios; reset_data; run_api; reset_data; run_screen ;;
  scenarios) run_scenarios ;;
  api)       reset_data; run_api ;;
  screen)    reset_data; run_screen ;;
  *) echo "知らない引数: $WHAT（all / scenarios / api / screen）"; exit 1 ;;
esac

if [ "$fail" != "0" ]; then
  echo
  echo "落ちたものがあります。記録は $OUT に残っています（**都合の悪い結果も残す**）。"
  exit 1
fi
echo
echo "記録を作り直しました: $OUT"
