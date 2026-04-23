export interface FileMetadata {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadTime: Date;
  expireAt: Date | null;
  password: string | null;
  maxDownloads: number | null;
  downloadCount: number;
}

export interface StorageSnapshotRecord {
  code: string;
  buffer?: Buffer;
  r2Key?: string;
  metadata: FileMetadata;
}

export interface StorageProvider {
  upload(
    code: string,
    buffer: Buffer,
    filename: string,
    metadata: Omit<FileMetadata, 'uploadTime' | 'downloadCount'>
  ): Promise<void>;
  registerUploadedObject(
    code: string,
    r2Key: string,
    originalName: string,
    metadata: Omit<FileMetadata, 'uploadTime' | 'downloadCount'>
  ): Promise<void>;
  download(code: string): Promise<{ buffer: Buffer; metadata: FileMetadata } | null>;
  streamDownload?(
    code: string
  ): Promise<{ stream: NodeJS.ReadableStream; metadata: FileMetadata; contentLength: number | null } | null>;
  delete(code: string): Promise<void>;
  getInfo(code: string): Promise<FileMetadata | null>;
  incrementDownload(code: string): Promise<void>;
  cleanupExpired(): Promise<void>;
  exportSnapshot(): StorageSnapshotRecord[];
  importSnapshot(records: StorageSnapshotRecord[]): Promise<void>;
  /** 按前缀批量删除（用于聊天房间附件清理） */
  deleteByPrefix?(prefix: string): Promise<void>;
}
