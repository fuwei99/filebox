import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type DeleteObjectsCommandOutput,
} from '@aws-sdk/client-s3';
import { appConfig } from '../config.js';
import type { FileMetadata, StorageProvider, StorageSnapshotRecord } from './types.js';

interface StoredFileMeta {
  metadata: FileMetadata;
  r2Key: string;
}

function getTtlPrefix(expireAt: Date | null): string {
  if (!expireAt) return 'perm';
  const hours = (expireAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours <= 24) return 'ttl-1d';
  if (hours <= 24 * 7) return 'ttl-7d';
  if (hours <= 24 * 30) return 'ttl-30d';
  return 'perm';
}

export class R2Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private storage = new Map<string, StoredFileMeta>();

  constructor() {
    const cfg = appConfig.r2;
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucketName) {
      throw new Error('[R2Storage] Missing R2 configuration. Please set endpoint, accessKeyId, secretAccessKey and bucketName.');
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    this.bucket = cfg.bucketName;
  }

  private normalizeCode(code: string): string {
    return code.trim().toLowerCase();
  }

  private buildKey(code: string, expireAt: Date | null): string {
    const prefix = getTtlPrefix(expireAt);
    return `${prefix}/${this.normalizeCode(code)}`;
  }

  async upload(
    code: string,
    buffer: Buffer,
    originalName: string,
    metadata: Omit<FileMetadata, 'uploadTime' | 'downloadCount'>
  ): Promise<void> {
    const normalizedCode = this.normalizeCode(code);
    const r2Key = this.buildKey(normalizedCode, metadata.expireAt);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: r2Key,
        Body: buffer,
        ContentType: metadata.mimeType || 'application/octet-stream',
        ContentLength: buffer.length,
      })
    );

    const stored: StoredFileMeta = {
      r2Key,
      metadata: {
        ...metadata,
        filename: metadata.filename,
        originalName,
        uploadTime: new Date(),
        downloadCount: 0,
      },
    };
    this.storage.set(normalizedCode, stored);
  }

  async download(code: string): Promise<{ buffer: Buffer; metadata: FileMetadata } | null> {
    const normalizedCode = this.normalizeCode(code);
    const file = this.storage.get(normalizedCode);
    if (!file) return null;

    if (file.metadata.expireAt && new Date() > file.metadata.expireAt) {
      await this.deleteFromR2(file.r2Key);
      this.storage.delete(normalizedCode);
      return null;
    }

    if (file.metadata.maxDownloads && file.metadata.downloadCount >= file.metadata.maxDownloads) {
      return null;
    }

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.r2Key,
      })
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error(`[R2Storage] Empty body for key ${file.r2Key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return { buffer, metadata: file.metadata };
  }

  async delete(code: string): Promise<void> {
    const normalizedCode = this.normalizeCode(code);
    const file = this.storage.get(normalizedCode);
    if (file) {
      await this.deleteFromR2(file.r2Key);
      this.storage.delete(normalizedCode);
    }
  }

  async getInfo(code: string): Promise<FileMetadata | null> {
    const normalizedCode = this.normalizeCode(code);
    const file = this.storage.get(normalizedCode);
    if (!file) return null;

    if (file.metadata.expireAt && new Date() > file.metadata.expireAt) {
      await this.deleteFromR2(file.r2Key);
      this.storage.delete(normalizedCode);
      return null;
    }

    return file.metadata;
  }

  async incrementDownload(code: string): Promise<void> {
    const file = this.storage.get(this.normalizeCode(code));
    if (file) {
      file.metadata.downloadCount++;
    }
  }

  async cleanupExpired(): Promise<void> {
    const now = new Date();
    const toDelete: string[] = [];
    for (const [code, file] of this.storage.entries()) {
      if (file.metadata.expireAt && now > file.metadata.expireAt) {
        toDelete.push(code);
      }
    }
    for (const code of toDelete) {
      await this.delete(code);
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = listResponse.Contents || [];
      if (objects.length > 0) {
        const deleteResponse: DeleteObjectsCommandOutput = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
            },
          })
        );
        if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
          console.error('[R2Storage] Batch delete errors:', deleteResponse.Errors);
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    // Also clean up local metadata entries matching the prefix
    for (const [code, file] of this.storage.entries()) {
      if (file.r2Key.startsWith(prefix)) {
        this.storage.delete(code);
      }
    }
  }

  exportSnapshot(): StorageSnapshotRecord[] {
    return Array.from(this.storage.entries()).map(([code, file]) => ({
      code,
      r2Key: file.r2Key,
      metadata: {
        ...file.metadata,
        uploadTime: new Date(file.metadata.uploadTime),
        expireAt: file.metadata.expireAt ? new Date(file.metadata.expireAt) : null,
      },
    }));
  }

  async importSnapshot(records: StorageSnapshotRecord[]): Promise<void> {
    this.storage.clear();
    for (const record of records) {
      const code = this.normalizeCode(record.code);

      if (record.r2Key) {
        // 正常 R2 记录，直接恢复元数据
        this.storage.set(code, {
          r2Key: record.r2Key,
          metadata: {
            ...record.metadata,
            uploadTime: new Date(record.metadata.uploadTime),
            expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
          },
        });
      } else if (record.buffer && record.buffer.length > 0) {
        // 旧 MemoryStorage 格式迁移：有 buffer 无 r2Key，上传到 R2
        try {
          const r2Key = this.buildKey(code, record.metadata.expireAt);
          await this.client.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: r2Key,
              Body: record.buffer,
              ContentType: record.metadata.mimeType || 'application/octet-stream',
              ContentLength: record.buffer.length,
            })
          );
          this.storage.set(code, {
            r2Key,
            metadata: {
              ...record.metadata,
              uploadTime: new Date(record.metadata.uploadTime),
              expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
            },
          });
          console.log(`[R2Storage] Migrated record ${code} from memory to R2 (${r2Key})`);
        } catch (error) {
          console.warn(`[R2Storage] Failed to migrate record ${code} to R2:`, error);
        }
      } else {
        console.warn(`[R2Storage] Skipping record ${code}: no r2Key and no buffer in snapshot`);
      }
    }
  }

  private async deleteFromR2(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      console.error(`[R2Storage] Failed to delete object ${key}:`, error);
    }
  }
}
