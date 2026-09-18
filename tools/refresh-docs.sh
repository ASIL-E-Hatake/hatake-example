#!/usr/bin/env bash
# `docs/**/出力-*.txt` を作り直す。
#
# 「出力-」で始まる紙は**道具が出したものをそのまま置いたもの**で、人は1文字も足していない
# （だから .md ではなく .txt）。手で直せる形にしておくと、いつの間にか都合よく書き換わって
# 「道具がこう言った」が嘘になるので、**作り直せる**ようにしてある。
#
# 1本目（master-maintenance-prj）では案件の中に置いていたが、**2本目でそのまま動いた**
# ので上げた。案件側の `tools/refresh-docs.sh` はここを呼ぶだけ。
#
# 使い方（案件のフォルダで叩く）:
#   tools/refresh-docs.sh          … 作り直す
#   tools/refresh-docs.sh --check  … 古くなっていないか見るだけ（違えば 1。CI 用）
set -euo pipefail

HATAKE="${HATAKE:-npx --yes hatake}"
DEF=definitions/app.yaml
PRJ=definitions/hatake.project.yaml
MEMO=docs/1-要件定義/案件の説明.md

gen() {
  # $1 = 置き場, 残りはコマンド
  local into="$1"; shift
  local tmp; tmp="$(mktemp)"
  # 問いも助言も終了コードを動かさない（人への依頼なので）。落ちても中身は取る。
  "$@" > "$tmp" 2>&1 || true
  if [ "${CHECK:-0}" = "1" ]; then
    if ! diff -q "$into" "$tmp" > /dev/null 2>&1; then
      echo "古くなっています: $into"
      diff "$into" "$tmp" || true
      rm -f "$tmp"
      return 1
    fi
  else
    mv "$tmp" "$into"
    echo "書きました: $into"
  fi
  rm -f "$tmp" 2>/dev/null || true
}

if [ "${1:-}" = "--check" ]; then CHECK=1; fi

fail=0
gen "docs/1-要件定義/出力-枠組みの外の仕分け.txt" $HATAKE where --from "$MEMO" || fail=1
gen "docs/2-設計/出力-残っている問い.txt"           $HATAKE ask "$DEF" --project "$PRJ" || fail=1
gen "docs/2-設計/出力-読み返しと助言.txt"           $HATAKE check "$DEF" --project "$PRJ" || fail=1
gen "docs/3-実装/出力-登録が要るもの.txt"           $HATAKE refs "$DEF" --needs-registration || fail=1

# 実装から「登録済みのもの」を作り直して、定義と突き合わせる。
# **手で書かない**＝手で書いた一覧を渡すと、道具が嘘をつく側に倒れる。
if [ "${CHECK:-0}" != "1" ]; then
  $HATAKE registry flutter-src/lib --out definitions/hatake-registry.json >/dev/null || fail=1
fi
gen "docs/3-実装/出力-画面の外との辻褄.txt"   $HATAKE validate "$DEF" --registry definitions/hatake-registry.json || fail=1

if [ "$fail" != "0" ]; then
  echo
  echo "作り直してから commit してください: tools/refresh-docs.sh"
  exit 1
fi
