import type { FileMetadata, StorageProvider, StorageSnapshotRecord } from './types.js';

interface StoredFile {
  buffer: Buffer;
  metadata: FileMetadata;
}

export class MemoryStorage implements StorageProvider {
  private storage = new Map<string, StoredFile>();
  private normalizeCode(code: string): string {
    return code.trim().toLowerCase();
  }

  exportSnapshot(): StorageSnapshotRecord[] {
    return Array.from(this.storage.entries()).map(([code, file]) => ({
      code,
      buffer: Buffer.from(file.buffer),
      metadata: {
        ...file.metadata,
        uploadTime: new Date(file.metadata.uploadTime),
        expireAt: file.metadata.expireAt ? new Date(file.metadata.expireAt) : null,
      },
    }));
  }

  importSnapshot(records: StorageSnapshotRecord[]): void {
    this.storage.clear();
    for (const record of records) {
      const code = this.normalizeCode(record.code);
      if (!record.buffer) {
        console.warn(`[memory-storage] Skipping record ${code}: no buffer in snapshot`);
        continue;
      }
      this.storage.set(code, {
        buffer: Buffer.from(record.buffer),
        metadata: {
          ...record.metadata,
          uploadTime: new Date(record.metadata.uploadTime),
          expireAt: record.metadata.expireAt ? new Date(record.metadata.expireAt) : null,
        },
      });
    }
  }

  async upload(
    code: string,
    buffer: Buffer,
    originalName: string,
    metadata: Omit<FileMetadata, 'uploadTime' | 'downloadCount'>
  ): Promise<void> {
    const filename = metadata.filename;
    const storedFile: StoredFile = {
      buffer,
      metadata: {
        ...metadata,
        filename,
        originalName,
        uploadTime: new Date(),
        downloadCount: 0,
      },
    };
    this.storage.set(this.normalizeCode(code), storedFile);
  }

  async download(code: string): Promise<{ buffer: Buffer; metadata: FileMetadata } | null> {
    const normalizedCode = this.normalizeCode(code);
    const file = this.storage.get(normalizedCode);
    if (!file) return null;

    if (file.metadata.expireAt && new Date() > file.metadata.expireAt) {
      this.storage.delete(normalizedCode);
      return null;
    }

    if (file.metadata.maxDownloads && file.metadata.downloadCount >= file.metadata.maxDownloads) {
      return null;
    }

    return { buffer: file.buffer, metadata: file.metadata };
  }

  async delete(code: string): Promise<void> {
    this.storage.delete(this.normalizeCode(code));
  }

  async getInfo(code: string): Promise<FileMetadata | null> {
    const normalizedCode = this.normalizeCode(code);
    const file = this.storage.get(normalizedCode);
    if (!file) return null;

    if (file.metadata.expireAt && new Date() > file.metadata.expireAt) {
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
    for (const [code, file] of this.storage.entries()) {
      if (file.metadata.expireAt && now > file.metadata.expireAt) {
        this.storage.delete(code);
      }
    }
  }
}

export const storage = new MemoryStorage();
