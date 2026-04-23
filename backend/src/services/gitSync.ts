import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppConfig } from '../config.js';
import type { StorageSnapshotRecord } from '../storage/types.js';
import type { StorageProvider } from '../storage/types.js';
import type { UserStorage, UserSnapshotRecord } from '../storage/user.js';
import type { ChatStorage, ChatSnapshot } from '../storage/chat.js';

const execFileAsync = promisify(execFile);

interface SnapshotJsonRecord {
  code: string;
  bufferBase64: string;
  metadata: {
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadTime: string;
    expireAt: string | null;
    password: string | null;
    maxDownloads: number | null;
    downloadCount: number;
  };
}

interface SnapshotChunkRecord {
  file: string;
  size: number;
}

interface SnapshotChunkedRecord {
  code: string;
  chunks: SnapshotChunkRecord[];
  metadata: SnapshotJsonRecord['metadata'];
}

interface SnapshotManifestJson {
  version: 2;
  chunkSizeBytes: number;
  chunkDir: string;
  records: SnapshotChunkedRecord[];
}

interface FullSnapshotV3 {
  version: 3;
  files: StorageSnapshotRecord[];
  users: UserSnapshotRecord[];
  chat: ChatSnapshot;
}

interface GitSyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  repoDir: string;
  snapshotFile: string;
  chunkSizeBytes: number;
  syncIntervalMs: number;
}

export class GitSyncService {
  private readonly config: GitSyncConfig;
  private readonly memoryStorage: StorageProvider;
  private readonly userStorage: UserStorage;
  private readonly chatStorage: ChatStorage;
  private syncing = false;

  constructor(
    memoryStorage: StorageProvider,
    userStorage: UserStorage,
    chatStorage: ChatStorage,
    config: GitSyncConfig
  ) {
    this.memoryStorage = memoryStorage;
    this.userStorage = userStorage;
    this.chatStorage = chatStorage;
    this.config = config;
  }

  static fromConfig(
    memoryStorage: StorageProvider,
    userStorage: UserStorage,
    chatStorage: ChatStorage,
    config: AppConfig
  ): GitSyncService | null {
    const enabled = config.gitSync.enabled;
    const owner = config.gitSync.owner;
    const repo = config.gitSync.repo;
    const branch = config.gitSync.branch || 'main';
    const token = config.gitSync.token;

    if (!enabled) return null;
    if (!owner || !repo || !token) {
      console.warn('[git-sync] Disabled because GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN is missing.');
      return null;
    }

    const repoDir = config.gitSync.dir
      ? path.resolve(config.gitSync.dir)
      : path.resolve(process.cwd(), '.sync', `${owner}-${repo}`);
    const snapshotFile = config.gitSync.snapshotFile || 'snapshot.json';
    const chunkSizeMB = Number(config.gitSync.chunkSizeMB || 32);
    const syncIntervalMinutes = Number(config.gitSync.intervalMinutes || 10);

    return new GitSyncService(memoryStorage, userStorage, chatStorage, {
      enabled,
      owner,
      repo,
      branch,
      token,
      repoDir,
      snapshotFile,
      chunkSizeBytes: Math.max(1, chunkSizeMB) * 1024 * 1024,
      syncIntervalMs: Math.max(1, syncIntervalMinutes) * 60 * 1000,
    });
  }

  get syncIntervalMs(): number {
    return this.config.syncIntervalMs;
  }

  async restoreFromRemote(): Promise<void> {
    try {
      await this.ensureRepoReady();
      const snapshot = await this.readFullSnapshotFromDisk();
      
      if (snapshot.files.length > 0) {
        this.memoryStorage.importSnapshot(snapshot.files);
      }
      if (snapshot.users.length > 0) {
        this.userStorage.importSnapshot(snapshot.users);
      }
      if (snapshot.chat.rooms.length > 0) {
        this.chatStorage.importSnapshot(snapshot.chat);
      }
      
      console.log(
        `[git-sync] Restored ${snapshot.files.length} files, ${snapshot.users.length} users, ${snapshot.chat.rooms.length} rooms from GitHub snapshot.`
      );
    } catch (error) {
      console.error('[git-sync] Restore failed:', this.redactError(error));
    }
  }

  async syncToRemote(): Promise<void> {
    if (!this.config.enabled || this.syncing) return;
    this.syncing = true;

    try {
      await this.ensureRepoReady();
      
      const snapshot: FullSnapshotV3 = {
        version: 3,
        files: this.memoryStorage.exportSnapshot(),
        users: this.userStorage.exportSnapshot(),
        chat: this.chatStorage.exportSnapshot(),
      };
      
      await this.writeFullSnapshotToDisk(snapshot);

      await this.runGit(['add', '-A']);
      const hasChanges = await this.hasStagedChanges();
      if (!hasChanges) {
        return;
      }

      await this.runGit([
        '-c',
        'user.name=FileBox Bot',
        '-c',
        'user.email=filebox-bot@local',
        'commit',
        '-m',
        `chore: sync snapshot ${new Date().toISOString()}`,
      ]);
      await this.runGit(['push', 'origin', this.config.branch]);

      console.log('[git-sync] Snapshot synced to GitHub.');
    } catch (error) {
      console.error('[git-sync] Sync failed:', this.redactError(error));
    } finally {
      this.syncing = false;
    }
  }

  private async ensureRepoReady(): Promise<void> {
    await fs.mkdir(this.config.repoDir, { recursive: true });

    const gitDir = path.join(this.config.repoDir, '.git');
    const gitDirExists = await this.exists(gitDir);

    if (!gitDirExists) {
      await fs.rm(this.config.repoDir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(this.config.repoDir), { recursive: true });
      await this.runGitGlobal([
        'clone',
        '--branch',
        this.config.branch,
        this.buildRemoteUrl(),
        this.config.repoDir,
      ]);
      return;
    }

    await this.runGit(['pull', '--rebase', 'origin', this.config.branch]);
  }

  private async writeSnapshotToDisk(records: StorageSnapshotRecord[]): Promise<void> {
    const filePath = this.snapshotPath();
    const chunkDirName = this.chunkDirectoryName();
    const chunkDirPath = this.chunkDirectoryPath();

    await fs.rm(chunkDirPath, { recursive: true, force: true });
    await fs.mkdir(chunkDirPath, { recursive: true });

    const payloadRecords: SnapshotChunkedRecord[] = [];

    for (const record of records) {
      const chunks = this.splitBufferToChunks(record.buffer ?? Buffer.alloc(0), this.config.chunkSizeBytes);
      const chunkRefs: SnapshotChunkRecord[] = [];

      for (let index = 0; index < chunks.length; index++) {
        const chunkFile = `${record.code}-${String(index).padStart(6, '0')}.part`;
        const chunkBuffer = chunks[index];
        await fs.writeFile(path.join(chunkDirPath, chunkFile), chunkBuffer);
        chunkRefs.push({
          file: chunkFile,
          size: chunkBuffer.length,
        });
      }

      payloadRecords.push({
        code: record.code,
        chunks: chunkRefs,
        metadata: {
          ...record.metadata,
          uploadTime: record.metadata.uploadTime.toISOString(),
          expireAt: record.metadata.expireAt ? record.metadata.expireAt.toISOString() : null,
        },
      });
    }

    const manifest: SnapshotManifestJson = {
      version: 2,
      chunkSizeBytes: this.config.chunkSizeBytes,
      chunkDir: chunkDirName,
      records: payloadRecords,
    };

    await fs.writeFile(filePath, JSON.stringify(manifest), 'utf-8');
  }

  private async readSnapshotFromDisk(): Promise<StorageSnapshotRecord[]> {
    const filePath = this.snapshotPath();
    const exists = await this.exists(filePath);
    if (!exists) return [];

    const text = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(text) as SnapshotJsonRecord[] | SnapshotManifestJson;

    if (Array.isArray(parsed)) {
      return this.parseLegacySnapshot(parsed);
    }

    if (parsed.version === 2) {
      return this.parseChunkedSnapshot(parsed);
    }

    throw new Error('[git-sync] Unsupported snapshot format.');
  }

  private snapshotPath(): string {
    return path.join(this.config.repoDir, this.config.snapshotFile);
  }

  private chunkDirectoryName(): string {
    const ext = path.extname(this.config.snapshotFile);
    const base = ext ? this.config.snapshotFile.slice(0, -ext.length) : this.config.snapshotFile;
    return `${base}-chunks`;
  }

  private chunkDirectoryPath(): string {
    return path.join(this.config.repoDir, this.chunkDirectoryName());
  }

  private splitBufferToChunks(buffer: Buffer, chunkSizeBytes: number): Buffer[] {
    if (buffer.length === 0) {
      return [Buffer.alloc(0)];
    }

    const chunks: Buffer[] = [];
    for (let offset = 0; offset < buffer.length; offset += chunkSizeBytes) {
      chunks.push(buffer.subarray(offset, Math.min(offset + chunkSizeBytes, buffer.length)));
    }
    return chunks;
  }

  private parseLegacySnapshot(records: SnapshotJsonRecord[]): StorageSnapshotRecord[] {
    return records.map((record) => ({
      code: record.code,
      buffer: Buffer.from(record.bufferBase64, 'base64'),
      metadata: {
        ...record.metadata,
        uploadTime: new Date(record.metadata.uploadTime),
        expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
      },
    }));
  }

  private async parseChunkedSnapshot(
    manifest: SnapshotManifestJson,
    baseDir: string = this.config.repoDir
  ): Promise<StorageSnapshotRecord[]> {
    const chunkDirPath = path.join(baseDir, manifest.chunkDir);
    const records: StorageSnapshotRecord[] = [];

    for (const record of manifest.records) {
      const buffers: Buffer[] = [];
      for (const chunk of record.chunks) {
        const chunkPath = path.join(chunkDirPath, chunk.file);
        buffers.push(await fs.readFile(chunkPath));
      }

      records.push({
        code: record.code,
        buffer: Buffer.concat(buffers),
        metadata: {
          ...record.metadata,
          uploadTime: new Date(record.metadata.uploadTime),
          expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
        },
      });
    }

    return records;
  }

  private async writeFullSnapshotToDisk(snapshot: FullSnapshotV3): Promise<void> {
    const snapshotDir = path.join(this.config.repoDir, 'snapshot-v3');
    await fs.mkdir(snapshotDir, { recursive: true });

    // Write files with chunking
    const filesManifest = await this.writeFilesSnapshot(snapshot.files, snapshotDir);

    // Write users (small data, single JSON)
    await fs.writeFile(
      path.join(snapshotDir, 'users.json'),
      JSON.stringify(snapshot.users),
      'utf-8'
    );

    // Write chat data (may be large)
    await fs.writeFile(
      path.join(snapshotDir, 'chat.json'),
      JSON.stringify(snapshot.chat),
      'utf-8'
    );

    // Write master manifest
    const masterManifest = {
      version: 3,
      files: filesManifest,
      hasUsers: snapshot.users.length > 0,
      hasChat: snapshot.chat.rooms.length > 0,
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(
      this.snapshotPath(),
      JSON.stringify(masterManifest),
      'utf-8'
    );
  }

  private async writeFilesSnapshot(
    records: StorageSnapshotRecord[],
    snapshotDir: string
  ): Promise<{ version: 2 | 3; chunkSizeBytes?: number; chunkDir?: string; records: any[] }> {
    // Detect if any record has buffer (memory mode), otherwise use lightweight metadata-only format (R2 mode)
    const hasBuffers = records.some((r) => r.buffer && r.buffer.length > 0);

    if (!hasBuffers) {
      // R2 mode: metadata-only snapshot, no chunks
      const payloadRecords = records.map((record) => ({
        code: record.code,
        r2Key: record.r2Key,
        metadata: {
          ...record.metadata,
          uploadTime: record.metadata.uploadTime.toISOString(),
          expireAt: record.metadata.expireAt ? record.metadata.expireAt.toISOString() : null,
        },
      }));

      return {
        version: 3,
        records: payloadRecords,
      };
    }

    // Memory mode: chunked snapshot with buffers
    const chunkDirName = 'files-chunks';
    const chunkDirPath = path.join(snapshotDir, chunkDirName);

    await fs.rm(chunkDirPath, { recursive: true, force: true });
    await fs.mkdir(chunkDirPath, { recursive: true });

    const payloadRecords: any[] = [];

    for (const record of records) {
      const chunks = this.splitBufferToChunks(record.buffer ?? Buffer.alloc(0), this.config.chunkSizeBytes);
      const chunkRefs: SnapshotChunkRecord[] = [];

      for (let index = 0; index < chunks.length; index++) {
        const chunkFile = `${record.code}-${String(index).padStart(6, '0')}.part`;
        const chunkBuffer = chunks[index];
        await fs.writeFile(path.join(chunkDirPath, chunkFile), chunkBuffer);
        chunkRefs.push({
          file: chunkFile,
          size: chunkBuffer.length,
        });
      }

      payloadRecords.push({
        code: record.code,
        chunks: chunkRefs,
        metadata: {
          ...record.metadata,
          uploadTime: record.metadata.uploadTime.toISOString(),
          expireAt: record.metadata.expireAt ? record.metadata.expireAt.toISOString() : null,
        },
      });
    }

    return {
      version: 2,
      chunkSizeBytes: this.config.chunkSizeBytes,
      chunkDir: chunkDirName,
      records: payloadRecords,
    };
  }

  private async readFullSnapshotFromDisk(): Promise<FullSnapshotV3> {
    const filePath = this.snapshotPath();
    const exists = await this.exists(filePath);

    if (!exists) {
      return { version: 3, files: [], users: [], chat: { rooms: [], members: [], messages: [] } };
    }

    const text = await fs.readFile(filePath, 'utf-8');
    const masterManifest = JSON.parse(text);

    // Handle legacy formats
    if (Array.isArray(masterManifest)) {
      // Old v1 format: direct array of files
      const files = this.parseLegacySnapshot(masterManifest);
      return { version: 3, files, users: [], chat: { rooms: [], members: [], messages: [] } };
    }

    if (masterManifest.version === 2) {
      // Old v2 format: chunked files only
      const files = await this.parseChunkedSnapshot(masterManifest as SnapshotManifestJson);
      return { version: 3, files, users: [], chat: { rooms: [], members: [], messages: [] } };
    }

    if (masterManifest.version === 3) {
      const snapshotDir = path.join(this.config.repoDir, 'snapshot-v3');

      // Read files
      let files: StorageSnapshotRecord[] = [];
      if (masterManifest.files) {
        if (masterManifest.files.version === 3) {
          // R2 mode: metadata-only, no chunks
          files = masterManifest.files.records.map((record: any) => ({
            code: record.code,
            r2Key: record.r2Key,
            metadata: {
              ...record.metadata,
              uploadTime: new Date(record.metadata.uploadTime),
              expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
            },
          }));
        } else {
          files = await this.parseChunkedSnapshot(masterManifest.files, snapshotDir);
        }
      }

      // Read users
      let users: UserSnapshotRecord[] = [];
      if (masterManifest.hasUsers) {
        const usersPath = path.join(snapshotDir, 'users.json');
        if (await this.exists(usersPath)) {
          const usersText = await fs.readFile(usersPath, 'utf-8');
          users = JSON.parse(usersText);
        }
      }

      // Read chat
      let chat: ChatSnapshot = { rooms: [], members: [], messages: [] };
      if (masterManifest.hasChat) {
        const chatPath = path.join(snapshotDir, 'chat.json');
        if (await this.exists(chatPath)) {
          const chatText = await fs.readFile(chatPath, 'utf-8');
          chat = JSON.parse(chatText);
        }
      }

      return { version: 3, files, users, chat };
    }

    throw new Error(`[git-sync] Unsupported snapshot version: ${masterManifest.version}`);
  }

  private async hasStagedChanges(): Promise<boolean> {
    try {
      await this.runGit(['diff', '--cached', '--quiet']);
      return false;
    } catch {
      return true;
    }
  }

  private async runGit(args: string[]): Promise<void> {
    await execFileAsync('git', args, { cwd: this.config.repoDir });
  }

  private async runGitGlobal(args: string[]): Promise<void> {
    await execFileAsync('git', args);
  }

  private buildRemoteUrl(): string {
    return `https://x-access-token:${encodeURIComponent(this.config.token)}@github.com/${this.config.owner}/${this.config.repo}.git`;
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  private redactError(error: unknown): unknown {
    const token = this.config.token;
    if (!token) return error;

    const redact = (value: string): string => value.split(token).join('***');

    if (typeof error === 'string') {
      return redact(error);
    }

    if (error instanceof Error) {
      return redact(error.stack ?? error.message);
    }

    try {
      return redact(JSON.stringify(error));
    } catch {
      return error;
    }
  }
}
