# API（Node）— 決め打ちの値を返すモック。
FROM node:22-slim
WORKDIR /app/node-src
COPY node-src/package.json ./
RUN npm install --omit=dev
COPY node-src/ ./
# 定義は焼き込まない（compose が案件の definitions/ を載せる）。
EXPOSE 3000
CMD ["node", "src/server.js"]
