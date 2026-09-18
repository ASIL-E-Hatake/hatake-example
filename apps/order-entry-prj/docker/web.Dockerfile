# 画面（Flutter Web）。**利用者に Flutter SDK を入れさせない**ための2段構え。
#
# 1段目でビルドして、2段目は nginx で配るだけ。出来上がりはただの静的ファイル。
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app

# 先に依存だけ取る（ソースを直しても取り直さない）。
# hatake は **git の tag から**入る（pubspec の ref: v0.9.1）。
COPY flutter-src/pubspec.yaml ./
RUN flutter pub get

COPY flutter-src/ ./
# 定義はサーバから読むので、ここには持ち込まない（コピーを作らない）。
# `--pwa-strategy=none`: service worker を登録しない。見本は毎回まっさらな所へ
# 配るので要らないし、**定義を差し替えたのに古い画面が出る**という混乱を防げる。
RUN flutter build web --release --pwa-strategy=none

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
COPY flutter-src/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
