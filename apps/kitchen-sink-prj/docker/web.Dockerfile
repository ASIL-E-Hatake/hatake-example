# 画面（Flutter Web）。**利用者に Flutter SDK を入れさせない**ための2段構え。
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app
COPY flutter-src/pubspec.yaml ./
RUN flutter pub get
COPY flutter-src/ ./
RUN flutter build web --release --pwa-strategy=none

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
COPY flutter-src/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
