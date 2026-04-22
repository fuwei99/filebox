# FileBox

简单快速的文件传递与图床服务。上传文件获取文件码，输入文件码即可提取文件。

## 功能

- **文件传递** - 上传获取6位短码，分享给他人即可下载
- **图床功能** - 图片支持外链访问 `/i/:code`
- **批量上传** - 最多10个文件同时上传
- **拖拽上传** - 支持拖拽文件到上传区域
- **文件过期** - 1小时 / 24小时 / 7天 / 永久
- **提取密码** - 可选密码保护敏感文件
- **下载次数限制** - 限制文件被下载的次数
- **二维码** - 自动生成二维码方便手机扫码
- **上传进度** - 实时显示上传进度
- **一键复制** - 复制文件码 / 下载链接 / 图床链接
- **图片预览** - 提取时在线预览图片
- **上传历史** - 本地记录已上传的文件码

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React + Tailwind CSS + TypeScript
- **存储**: 内存存储（预留 Cloudflare R2 接口）

## 快速开始

### 方式一：直接运行

1. 安装依赖：

```bash
cd backend && npm install
cd ../frontend && npm install
```

2. 准备配置：

```bash
# 推荐：直接编辑根目录 config.json
# 可先复制模板：copy config.json.example config.json
# 可选回退：copy .env.example .env（仅 CONFIG 一项）
```

3. 启动服务：

```bash
start.bat
```

`start.bat` 会先构建前端，再由后端在同一端口提供页面和 API。

或手动启动：

```bash
# 单端口运行（部署推荐）
cd frontend && npm run build
cd ../backend && npx tsx src/index.ts

# 开发模式（双进程 + 热更新，可选）
# 终端1: cd backend && npx tsx src/index.ts
# 终端2: cd frontend && npx vite
```

4. 访问 http://localhost:7860

### 方式二：Docker

```bash
docker build -t filebox .
docker run -d -p 7860:7860 filebox
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload | 上传单个文件 |
| POST | /api/upload/batch | 批量上传（最多10个） |
| GET | /api/download/:code | 下载文件 |
| GET | /api/download/preview/:code | 预览文件 |
| GET | /api/download/info/:code | 获取文件信息 |
| GET | /api/download/qrcode/:code | 获取二维码 |
| GET | /i/:code | 图床外链（直接显示图片） |

## 配置

优先读取根目录 `config.json`。若不存在，则回退读取 `.env` 中的 `CONFIG`（单行 JSON）。

常用配置项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| port | 7860 | 后端端口 |
| maxFileSize | 104857600 | 单文件大小限制（100MB） |
| maxBatchSize | 10 | 批量上传数量限制 |
| defaultExpire | 24 | 默认过期时间（小时） |

## 存储说明

当前使用内存存储，服务重启后数据将丢失。

### GitHub 同步备份模式（推荐 Replit）

支持“**内存优先 + GitHub 定时同步**”模式：
- 运行时仍从内存读写（速度快）
- 启动时自动 `clone/pull` 并恢复快照
- 运行中每隔一段时间自动 `commit/push` 快照到 GitHub 私有仓库
- 服务退出时会再执行一次同步
- 同步内容是后端完整存储快照（不仅文件本体，还包含密码、过期时间、下载限制、下载计数等元数据）

开启方式：

1. 在 GitHub 创建私有仓库（例如 `fuwei99/filebox-data`），先做一次初始提交（确保有 `main` 分支）。
2. 创建 Fine-grained PAT，授予该仓库 `Contents: Read and write`。
3. 配置 `config.json` 的 `gitSync`：

```bash
"gitSync": {
  "enabled": true,
  "owner": "fuwei99",
  "repo": "filebox-data",
  "branch": "main",
  "token": "your_token",
  "intervalMinutes": 10,
  "snapshotFile": "snapshot.json"
}
```

说明：
- GitHub 单文件大小限制约为 100MB，建议留出余量。
- 该模式用于“重启恢复/云端备份”，不建议高频大文件场景长期使用。

预留了 Cloudflare R2 存储接口，购买 R2 服务后可实现持久化存储。切换方式：
1. 在 `config.json` 的 `r2` 节点填写配置
2. 修改 `backend/src/storage/` 中的存储适配器

## 项目结构

```
filebox/
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/          # API 路由
│   │   ├── storage/         # 存储适配器
│   │   │   ├── memory.ts    # 内存存储
│   │   │   └── r2.ts        # R2 存储（预留）
│   │   └── utils/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/             # API 封装
│   │   └── components/      # React 组件
│   └── package.json
├── Dockerfile
├── .env.example
├── config.json
├── start.bat
└── README.md
```

## License

MIT
