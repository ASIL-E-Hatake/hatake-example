# 道具（`hatake` の CLI）。定義を検査する・読み返す・設計書を出す。
#
#   docker compose run --rm hatake check definitions/app.yaml
#
# 手元に Node を入れなくても叩けるように、コンテナに入れてある。
FROM node:22-slim
RUN npm install -g --no-audit --no-fund \
    https://github.com/ASIL-E-Hatake/hatake/releases/download/v0.9.30/hatake-fw-api-0.9.30.tgz
WORKDIR /work
ENTRYPOINT ["hatake"]
CMD ["--help"]
