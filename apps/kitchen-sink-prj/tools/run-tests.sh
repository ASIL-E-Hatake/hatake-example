#!/usr/bin/env bash
# 中身は案件の外（`../../tools/run-tests.sh`）。**案件をまたいで同じ道具**を使う。
# 案件ごとに違うところは `tools/test.config.sh`。
#
#   bash tools/run-tests.sh            … 全部
#   bash tools/run-tests.sh scenarios  … 値だけ
#   bash tools/run-tests.sh api        … API だけ
#   bash tools/run-tests.sh screen     … 画面だけ
set -euo pipefail
cd "$(dirname "$0")/.."
exec bash ../../tools/run-tests.sh "$@"
