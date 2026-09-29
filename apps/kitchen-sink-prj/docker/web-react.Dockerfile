# 画面（React 版）。**利用者に Node を入れさせない**ための2段構え。
#
# Flutter 版（web.Dockerfile）・Vue 版（web-vue.Dockerfile）と**同じ定義・同じ API**を
# 見る。違うのは描く側だけで、それがこの見本で確かめたいこと。
FROM node:22-slim AS build
WORKDIR /app
COPY react-src/package.json ./
# 枠組みは Release の tarball から入れる（見本は案件の側なので、普通の入れ方をする）。
RUN npm install --no-audit --no-fund
COPY react-src/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY react-src/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
