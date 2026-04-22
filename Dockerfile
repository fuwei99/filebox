FROM node:20-alpine AS builder

WORKDIR /app

# 安装后端依赖
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install

# 安装前端依赖并构建
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm install

# 复制源码
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# 构建前端
RUN cd frontend && npm run build

# 构建后端
RUN cd backend && npm run build

# 生产镜像
FROM node:20-alpine AS runner
WORKDIR /app

# 复制后端构建产物
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/

# 复制前端构建产物到后端静态目录
COPY --from=builder /app/frontend/dist ./frontend/dist

# 复制配置文件
COPY config.json.example ./config.json

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "backend/dist/index.js"]
