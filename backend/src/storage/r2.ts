// Cloudflare R2 存储预留接口
// 未来可以在这里实现 R2 存储适配器

import type { StorageProvider } from './memory.js';

export class R2Storage implements StorageProvider {
  // TODO: 实现 R2 客户端
  private r2Client: any = null;
  private bucket: string = '';

  constructor() {
    // 初始化 R2 客户端
    // this.r2Client = new S3Client({
    //   region: 'auto',
    //   endpoint: process.env.R2_ENDPOINT,
    //   credentials: {
    //     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    //     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    //   },
    // });
    // this.bucket = process.env.R2_BUCKET_NAME!;
  }

  async upload(
    code: string,
    buffer: Buffer,
    filename: string,
    metadata: any
  ): Promise<void> {
    throw new Error('R2 storage not implemented yet');
  }

  async download(code: string): Promise<{ buffer: Buffer; metadata: any } | null> {
    throw new Error('R2 storage not implemented yet');
  }

  async delete(code: string): Promise<void> {
    throw new Error('R2 storage not implemented yet');
  }

  async getInfo(code: string): Promise<any | null> {
    throw new Error('R2 storage not implemented yet');
  }

  async incrementDownload(code: string): Promise<void> {
    throw new Error('R2 storage not implemented yet');
  }

  async cleanupExpired(): Promise<void> {
    throw new Error('R2 storage not implemented yet');
  }
}
