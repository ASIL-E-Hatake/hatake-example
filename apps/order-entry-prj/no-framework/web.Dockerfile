# 画面（Flutter Web）— フレームワーク**無し**版。
#
# hatake 版との差は pubspec の中身だけ（枠組みを入れず、画面を手で書く）。
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app

COPY no-framework/flutter-src/pubspec.yaml ./
RUN flutter pub get

COPY no-framework/flutter-src/ ./
RUN flutter build web --release --pwa-strategy=none

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
COPY no-framework/flutter-src/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
