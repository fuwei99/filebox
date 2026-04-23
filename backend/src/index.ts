import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import uploadRoutes from './routes/upload.js';
import downloadRoutes from './routes/download.js';
import imageRoutes from './routes/image.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import { appConfig } from './config.js';
import { storage } from './storage/index.js';
import { userStorage } from './storage/user.js';
import { chatStorage } from './storage/chat.js';
import { GitSyncService } from './services/gitSync.js';
import { registerChatSocket } from './socket/chat.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});
const PORT = Number(process.env.PORT ?? appConfig.port);
const gitSync = GitSyncService.fromConfig(storage, userStorage, chatStorage, appConfig);

const resolveFrontendDist = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(process.cwd(), '..', 'frontend', 'dist'),
  ];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  return found ?? null;
};

// 中间件
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 路由
app.use('/api/upload', uploadRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/i', imageRoutes);

const frontendDist = resolveFrontendDist();
if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/i/')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log(`[static] Serving frontend from ${frontendDist}`);
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 公开配置
app.get('/api/config', (req, res) => {
  res.json({
    maxFileSize: appConfig.maxFileSize,
    maxBatchSize: appConfig.maxBatchSize,
  });
});

const start = async () => {
  // Register Socket.io handlers
  registerChatSocket(io, chatStorage, userStorage);

  if (gitSync) {
    await gitSync.restoreFromRemote();
    setInterval(() => {
      void gitSync.syncToRemote();
    }, gitSync.syncIntervalMs);
  }

  // 定期清理过期文件（每30分钟）
  setInterval(async () => {
    await storage.cleanupExpired();
    await chatStorage.cleanupExpired();
  }, 30 * 60 * 1000);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

const shutdown = async () => {
  if (gitSync) {
    await gitSync.syncToRemote();
  }
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

void start();
