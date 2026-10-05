# 画面（Vue 版）。**手元に Node を入れさせない**ための2段構え。
FROM node:22-slim AS build
WORKDIR /app
COPY web/package.json ./
# 枠組みは Release の tarball から入れる（普通の入れ方）。
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
