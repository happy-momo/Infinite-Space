# ---------- 构建阶段 / Build stage ----------
# 使用 Node 22 (Vite 6 要求 ^18 || ^20 || >=22)，alpine 减小体积。
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- 运行阶段 / Runtime stage ----------
# 注意：打包后的  dist/server.cjs 在顶层 require("vite")（开发中间件被编译进
# 产物，仅 dev 分支使用），因此这里必须安装完整依赖集合，不能用 --omit=dev。
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# 先装依赖并清缓存
RUN npm ci && npm cache clean --force

# 拷贝构建产物
COPY --from=build /app/dist ./dist

# 用非 root 用户运行（data/ 里含 API Key）
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app
USER app

# 画布状态与 LLM 配置持久化目录（由 -v 挂载）
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "dist/server.cjs"]