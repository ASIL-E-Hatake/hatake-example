# 初見試験の部屋。**hatake を知らない AI** が、配った物だけで作業する場所。
#
#   入っているもの: Claude Code・hatake（CLI と MCP。版は hatake.version）・git
#   入っていないもの: 見本のリポジトリ・枠組みのソース・メモリ・CLAUDE.md
#
# 作り方（evals/run.sh image が叩く）:
#   docker build --build-arg TAG=v0.9.27 -t hatake-eval:v0.9.27 evals/harness
FROM node:22-slim

ARG TAG
RUN test -n "$TAG" || (echo "TAG を渡してください（例: --build-arg TAG=v0.9.27）" && exit 1)

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Claude Code は版を固定しない（AI の側は利用者と同じ最新を使う）。入った版は記録に残す。
RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code \
 && claude --version > /opt/claude-version.txt

# hatake は Release の tarball から（手引きどおりの入れ方）。MCP もここから立つ。
RUN npm install -g --no-audit --no-fund \
    "https://github.com/ASIL-E-Hatake/hatake/releases/download/${TAG}/hatake-fw-api-${TAG#v}.tgz" \
 && hatake --version > /opt/hatake-version.txt

# 採点の道具が読む（AI の作業場には置かない）。
WORKDIR /opt/grade
RUN npm init -y > /dev/null \
 && npm install --no-audit --no-fund \
    "https://github.com/ASIL-E-Hatake/hatake/releases/download/${TAG}/hatake-fw-api-${TAG#v}.tgz"

# root では権限の確認を飛ばせないので、node で動かす。
USER node
WORKDIR /work
