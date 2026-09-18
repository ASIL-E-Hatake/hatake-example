#!/usr/bin/env bash
# 中身は案件の外（`../../tools/refresh-docs.sh`）。**案件をまたいで同じ道具**を使う。
#
#   tools/refresh-docs.sh          … 作り直す
#   tools/refresh-docs.sh --check  … 古くなっていないか見るだけ（CI 用）
set -euo pipefail
cd "$(dirname "$0")/.."
exec bash ../../tools/refresh-docs.sh "$@"
