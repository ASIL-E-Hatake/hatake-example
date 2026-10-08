#!/usr/bin/env bash
# 案件の定義を **VS Code 拡張で開いたところ**を撮る（手で撮らない）。
#
#   bash tools/vscode-shots.sh apps/order-entry-prj
#
# `hatake.version` と同じ版の `.vsix` を Release から取り、code-server（ブラウザで動く
# VS Code）に入れて、案件の定義を開いて puppeteer で撮る（tools/vscode-shots.mjs）。
# 撮るだけでなく、**撮れた中身を案件の紙と突き合わせる**（「人が決めること」が
# `docs/2-設計/出力-残っている問い.txt` と同じか・役割で見え方が変わるか）。
# 画像は `<案件>/手順/VSCode/` に入る。手元に要るのは Docker と bash と curl だけ。
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRJ="$(cd "${1:?案件のフォルダを渡してください（例: apps/order-entry-prj）}" && pwd)"
TAG="$(tr -d '[:space:]' < "$ROOT/hatake.version")"
OUT="$PRJ/手順/VSCode"
# 作業場はリポジトリの中の、git が見ない置き場。
WORK="$ROOT/.data/vscode-shots"
NET=hatake-vscode-shots
CODE=hatake-vscode-shots-code

win() { (cd "$1" && pwd -W 2>/dev/null || pwd); }

# 作業場: 案件の定義（前書きも同じフォルダ＝拡張機能は隣の前書きを読む）と固定した版だけ。
rm -rf "$WORK" && mkdir -p "$WORK/project" "$WORK/ext" "$OUT"
cp -r "$PRJ/definitions" "$WORK/project/"
cp "$ROOT/hatake.version" "$WORK/project/"
# 突き合わせに使う紙と、何を撮るか（puppeteer の部屋の人が読めるように写す）。
mkdir -p "$WORK/prj/tools" "$WORK/prj/docs/2-設計"
cp "$PRJ/tools/vscode-shots.json" "$WORK/prj/tools/"
cp "$PRJ/docs/2-設計/出力-残っている問い.txt" "$WORK/prj/docs/2-設計/"
# 道は Windows の形で渡す（上で道の書き換えを止めているので、Windows の curl は /c/… に書けない）。
curl -fsSL -o "$(win "$WORK/ext")/hatake.vsix" \
  "https://github.com/ASIL-E-Hatake/hatake/releases/download/$TAG/hatake-vscode-${TAG#v}.vsix"
cat > "$WORK/ext/settings.json" <<'JSON'
{
  "security.workspace.trust.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.colorTheme": "Default Light Modern",
  "editor.minimap.enabled": false,
  "extensions.ignoreRecommendations": true,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "chat.commandCenter.enabled": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden"
}
JSON
chmod -R a+rwX "$WORK"

docker network inspect "$NET" > /dev/null 2>&1 || docker network create "$NET" > /dev/null
docker rm -f "$CODE" > /dev/null 2>&1 || true
cleanup() { docker rm -f "$CODE" > /dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
docker run -d --name "$CODE" --network "$NET" \
  -v "$(win "$WORK/project"):/home/coder/project" \
  -v "$(win "$WORK/ext"):/x" \
  --entrypoint /bin/sh codercom/code-server:latest \
  -c 'mkdir -p ~/.local/share/code-server/User && cp /x/settings.json ~/.local/share/code-server/User/ &&
      code-server --install-extension /x/hatake.vsix &&
      exec code-server --auth none --bind-addr 0.0.0.0:8080 /home/coder/project' > /dev/null

# Webview は localhost か https でないと動かないので、同じネットワークの中から localhost で開く。
docker run --rm --network "container:$CODE" \
  -v "$(win "$WORK/prj"):/prj:ro" -v "$(win "$OUT"):/out" -v "$(win "$ROOT/tools"):/t:ro" \
  ghcr.io/puppeteer/puppeteer:latest \
  sh -c "cp /t/vscode-shots.mjs . && node vscode-shots.mjs http://localhost:8080 /prj /out ${TAG#v}"
