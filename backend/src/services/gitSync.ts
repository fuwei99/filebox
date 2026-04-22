import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppConfig } from '../config.js';
import type { MemoryStorage, StorageSnapshotRecord } from '../storage/memory.js';

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

interface GitSyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  repoDir: string;
  snapshotFile: string;
  syncIntervalMs: number;
}

export class GitSyncService {
  private readonly config: GitSyncConfig;
  private readonly memoryStorage: MemoryStorage;
  private syncing = false;

  constructor(memoryStorage: MemoryStorage, config: GitSyncConfig) {
    this.memoryStorage = memoryStorage;
    this.config = config;
  }

  static fromConfig(memoryStorage: MemoryStorage, config: AppConfig): GitSyncService | null {
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
    const syncIntervalMinutes = Number(config.gitSync.intervalMinutes || 10);

    return new GitSyncService(memoryStorage, {
      enabled,
      owner,
      repo,
      branch,
      token,
      repoDir,
      snapshotFile,
      syncIntervalMs: Math.max(1, syncIntervalMinutes) * 60 * 1000,
    });
  }

  get syncIntervalMs(): number {
    return this.config.syncIntervalMs;
  }

  async restoreFromRemote(): Promise<void> {
    try {
      await this.ensureRepoReady();
      const records = await this.readSnapshotFromDisk();
      this.memoryStorage.importSnapshot(records);
      console.log(`[git-sync] Restored ${records.length} records from GitHub snapshot.`);
    } catch (error) {
      console.error('[git-sync] Restore failed:', this.redactError(error));
    }
  }

  async syncToRemote(): Promise<void> {
    if (!this.config.enabled || this.syncing) return;
    this.syncing = true;

    try {
      await this.ensureRepoReady();
      await this.writeSnapshotToDisk(this.memoryStorage.exportSnapshot());

      await this.runGit(['add', this.config.snapshotFile]);
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
    const payload: SnapshotJsonRecord[] = records.map((record) => ({
      code: record.code,
      bufferBase64: record.buffer.toString('base64'),
      metadata: {
        ...record.metadata,
        uploadTime: record.metadata.uploadTime.toISOString(),
        expireAt: record.metadata.expireAt ? record.metadata.expireAt.toISOString() : null,
      },
    }));

    await fs.writeFile(filePath, JSON.stringify(payload), 'utf-8');
  }

  private async readSnapshotFromDisk(): Promise<StorageSnapshotRecord[]> {
    const filePath = this.snapshotPath();
    const exists = await this.exists(filePath);
    if (!exists) return [];

    const text = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(text) as SnapshotJsonRecord[];

    return parsed.map((record) => ({
      code: record.code,
      buffer: Buffer.from(record.bufferBase64, 'base64'),
      metadata: {
        ...record.metadata,
        uploadTime: new Date(record.metadata.uploadTime),
        expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
      },
    }));
  }

  private snapshotPath(): string {
    return path.join(this.config.repoDir, this.config.snapshotFile);
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
