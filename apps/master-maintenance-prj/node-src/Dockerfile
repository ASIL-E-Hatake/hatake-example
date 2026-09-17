# API（Express + @hatake-fw/api）。
#
# `@hatake-fw/api` は**レジストリではなく GitHub Release の tarball**から入れる
# （まだ npm に publish していないので。→ hatake の docs/guide/release.ja.md）。
FROM node:22-slim

# **リポジトリと同じ階層のまま**持ち込む。
#
# `src` を /app に、`definitions` を /app に平たく置くと、`definition.js` が見る
# `../../definitions` がコンテナの中だけずれる（実際それで起動時に落ちた）。
# 手元と同じ形にしておけば、パスの話がコンテナ固有の知識にならない。
WORKDIR /app/node-src

# `@hatake-fw/api` の入手先。既定は Release の tarball。
# フレームワークを手元で直しながら試すときは、固めたものを渡して差し替える:
#   docker compose build --build-arg HATAKE_PKG=/pkg.tgz
ARG HATAKE_PKG=""

# 先に依存だけ入れる（ソースを直しても入れ直さない）。
COPY node-src/package.json ./
RUN if [ -n "$HATAKE_PKG" ]; then npm pkg set dependencies.@hatake-fw/api="$HATAKE_PKG"; fi  && npm install --omit=dev --no-audit --no-fund

COPY node-src/src ./src
# **画面と同じ定義**をそのまま持ち込む（コピーを作らない＝ここが hatake の主張）。
COPY definitions /app/definitions

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
