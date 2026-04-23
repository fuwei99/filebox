import express from 'express';
import crypto from 'node:crypto';
import {
  S3Client,
  HeadObjectCommand,
  type PutObjectCommandInput,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from '../config.js';
import { storage } from '../storage/index.js';
import { generateCode } from '../utils/code.js';
import { requireServerAuth } from '../middleware/auth.js';

const router = express.Router();

type UploadScope = 'file' | 'chat';

interface PrepareBody {
  filename?: string;
  size?: number;
  mimeType?: string;
  expireHours?: number | string;
  expireValue?: number | string;
  expireUnit?: 'hour' | 'day' | string;
  password?: string;
  maxDownloads?: number | string;
  scope?: UploadScope;
}

interface PendingUploadIntent {
  token: string;
  code: string;
  bucket: string;
  r2Key: string;
  filename: string;
  mimeType: string;
  size: number;
  expireAt: Date | null;
  password: string | null;
  maxDownloads: number | null;
  scope: UploadScope;
  createdAt: Date;
}

const pendingUploads = new Map<string, PendingUploadIntent>();
const pendingTtlMs = 15 * 60 * 1000;

const isR2Enabled = (): boolean => {
  return appConfig.storage === 'r2';
};

const normalizeFilename = (filename: string): string => {
  return Buffer.from(filename || 'file', 'latin1').toString('utf8').trim() || 'file';
};

const sanitizeScope = (scope: unknown): UploadScope => {
  return scope === 'chat' ? 'chat' : 'file';
};

const parsePositiveInteger = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
};

const parseExpireHours = (body: PrepareBody): number => {
  if (body.expireValue !== undefined || body.expireUnit !== undefined) {
    const value = Number(body.expireValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Invalid custom expire value');
    }
    if (value === 0) {
      return 0;
    }
    const unit = body.expireUnit === 'day' ? 'day' : 'hour';
    return unit === 'day' ? value * 24 : value;
  }

  if (body.expireHours === undefined || body.expireHours === null || body.expireHours === '') {
    return appConfig.defaultExpire;
  }

  const hours = Number(body.expireHours);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('Invalid expireHours');
  }
  return hours;
};

const getTtlPrefix = (expireAt: Date | null): string => {
  if (!expireAt) return 'perm';
  const hours = (expireAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours <= 24) return 'ttl-1d';
  if (hours <= 24 * 7) return 'ttl-7d';
  if (hours <= 24 * 30) return 'ttl-30d';
  return 'perm';
};

const buildR2Key = (code: string, expireAt: Date | null, scope: UploadScope): string => {
  const prefix = getTtlPrefix(expireAt);
  const scopePrefix = scope === 'chat' ? 'chat' : 'upload';
  return `${scopePrefix}/${prefix}/${code.toLowerCase()}`;
};

const getR2Client = (): S3Client => {
  return new S3Client({
    region: 'auto',
    endpoint: appConfig.r2.endpoint,
    credentials: {
      accessKeyId: appConfig.r2.accessKeyId,
      secretAccessKey: appConfig.r2.secretAccessKey,
    },
  });
};

const cleanupPendingUploads = (): void => {
  const now = Date.now();
  for (const [token, intent] of pendingUploads.entries()) {
    if (now - intent.createdAt.getTime() > pendingTtlMs) {
      pendingUploads.delete(token);
    }
  }
};

const createIntent = (body: PrepareBody, req: express.Request): PendingUploadIntent => {
  const filename = normalizeFilename(String(body.filename || '').trim());
  const size = Number(body.size || 0);
  const mimeType = String(body.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const scope = sanitizeScope(body.scope);

  if (!filename) {
    throw new Error('Filename is required');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Invalid file size');
  }
  if (size > appConfig.maxFileSize) {
    const err = new Error('File too large');
    (err as Error & { status?: number }).status = 413;
    throw err;
  }

  const expireHours = parseExpireHours(body);
  const expireAt = expireHours > 0 ? new Date(Date.now() + expireHours * 60 * 60 * 1000) : null;

  const maxDownloads = parsePositiveInteger(body.maxDownloads);
  const passwordRaw = typeof body.password === 'string' ? body.password : '';
  const password = passwordRaw.trim() ? passwordRaw.trim() : null;

  const code = generateCode().toLowerCase();
  const r2Key = buildR2Key(code, expireAt, scope);

  const token = crypto.randomUUID();
  const intent: PendingUploadIntent = {
    token,
    code,
    bucket: appConfig.r2.bucketName,
    r2Key,
    filename,
    mimeType,
    size,
    expireAt,
    password,
    maxDownloads,
    scope,
    createdAt: new Date(),
  };

  pendingUploads.set(token, intent);

  const contentLength = req.headers['content-length'] || 'unknown';
  console.log(
    `[upload-direct] prepared scope=${scope} code=${code} size=${size} content-length=${contentLength} maxFileSize=${appConfig.maxFileSize}`
  );

  return intent;
};

const buildPrepareResponse = async (
  intent: PendingUploadIntent,
  client: S3Client,
  req: express.Request
): Promise<{
  uploadToken: string;
  code: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  filename: string;
  size: number;
  mimeType: string;
  expireAt: Date | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  imageUrl: string | null;
}> => {
  const putInput: PutObjectCommandInput = {
    Bucket: intent.bucket,
    Key: intent.r2Key,
    ContentType: intent.mimeType,
    ContentLength: intent.size,
  };
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand(putInput), {
    expiresIn: 300,
  });

  return {
    uploadToken: intent.token,
    code: intent.code,
    uploadUrl,
    method: 'PUT',
    headers: {
      'content-type': intent.mimeType,
    },
    filename: intent.filename,
    size: intent.size,
    mimeType: intent.mimeType,
    expireAt: intent.expireAt,
    hasPassword: !!intent.password,
    maxDownloads: intent.maxDownloads,
    imageUrl: intent.mimeType.startsWith('image/')
      ? `${req.protocol}://${req.get('host')}/i/${intent.code}`
      : null,
  };
};

router.use((req, _res, next) => {
  cleanupPendingUploads();
  const contentLength = req.headers['content-length'] || 'unknown';
  const contentType = req.headers['content-type'] || 'unknown';
  console.log(`[upload-direct] incoming ${req.method} ${req.originalUrl} content-length=${contentLength} content-type=${contentType}`);
  next();
});

router.post('/prepare', requireServerAuth, async (req, res) => {
  if (!isR2Enabled()) {
    return res.status(400).json({ error: 'Direct upload requires storage=r2' });
  }

  try {
    const client = getR2Client();
    const intent = createIntent((req.body || {}) as PrepareBody, req);
    const data = await buildPrepareResponse(intent, client, req);
    res.json({ success: true, ...data });
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 413) {
      return res.status(413).json({
        error: 'File too large',
        maxFileSize: appConfig.maxFileSize,
      });
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prepare payload' });
  }
});

router.post('/prepare-batch', requireServerAuth, async (req, res) => {
  if (!isR2Enabled()) {
    return res.status(400).json({ error: 'Direct upload requires storage=r2' });
  }

  try {
    const files = Array.isArray(req.body?.files) ? (req.body.files as PrepareBody[]) : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files to prepare' });
    }
    if (files.length > appConfig.maxBatchSize) {
      return res.status(400).json({ error: `Batch too large, max ${appConfig.maxBatchSize}` });
    }

    const common: Omit<PrepareBody, 'filename' | 'size' | 'mimeType'> = {
      expireHours: req.body?.expireHours,
      expireValue: req.body?.expireValue,
      expireUnit: req.body?.expireUnit,
      password: req.body?.password,
      maxDownloads: req.body?.maxDownloads,
      scope: req.body?.scope,
    };

    const client = getR2Client();
    const results = await Promise.all(
      files.map(async (fileBody) => {
        const intent = createIntent({ ...common, ...fileBody }, req);
        return buildPrepareResponse(intent, client, req);
      })
    );

    res.json({ success: true, files: results });
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 413) {
      return res.status(413).json({
        error: 'File too large',
        maxFileSize: appConfig.maxFileSize,
      });
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid batch prepare payload' });
  }
});

router.post('/complete', requireServerAuth, async (req, res) => {
  if (!isR2Enabled()) {
    return res.status(400).json({ error: 'Direct upload requires storage=r2' });
  }

  const uploadToken = String(req.body?.uploadToken || '').trim();
  if (!uploadToken) {
    return res.status(400).json({ error: 'uploadToken is required' });
  }

  const intent = pendingUploads.get(uploadToken);
  if (!intent) {
    return res.status(404).json({ error: 'Upload intent expired or not found' });
  }

  try {
    const client = getR2Client();
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: intent.bucket,
        Key: intent.r2Key,
      })
    );

    if (typeof head.ContentLength !== 'number' || head.ContentLength !== intent.size) {
      return res.status(400).json({ error: 'Uploaded object size mismatch' });
    }

    if (head.ContentType && intent.mimeType && head.ContentType !== intent.mimeType) {
      return res.status(400).json({ error: 'Uploaded object content-type mismatch' });
    }

    await storage.registerUploadedObject(intent.code, intent.r2Key, intent.filename, {
      filename: intent.filename,
      originalName: intent.filename,
      mimeType: intent.mimeType,
      size: intent.size,
      expireAt: intent.expireAt,
      password: intent.password,
      maxDownloads: intent.maxDownloads,
    });

    pendingUploads.delete(uploadToken);

    res.json({
      success: true,
      code: intent.code,
      filename: intent.filename,
      size: intent.size,
      mimeType: intent.mimeType,
      expireAt: intent.expireAt,
      hasPassword: !!intent.password,
      maxDownloads: intent.maxDownloads,
      imageUrl: intent.mimeType.startsWith('image/')
        ? `${req.protocol}://${req.get('host')}/i/${intent.code}`
        : null,
    });
  } catch (error) {
    console.error('[upload-direct] complete failed:', error);
    res.status(500).json({ error: 'Upload completion failed' });
  }
});

router.post('/complete-batch', requireServerAuth, async (req, res) => {
  if (!isR2Enabled()) {
    return res.status(400).json({ error: 'Direct upload requires storage=r2' });
  }

  const tokens = Array.isArray(req.body?.uploadTokens) ? (req.body.uploadTokens as string[]) : [];
  if (tokens.length === 0) {
    return res.status(400).json({ error: 'uploadTokens is required' });
  }

  const results = await Promise.all(
    tokens.map(async (token) => {
      const intent = pendingUploads.get(String(token));
      if (!intent) {
        return { success: false, uploadToken: token, error: 'Upload intent expired or not found' };
      }

      try {
        const client = getR2Client();
        const head = await client.send(
          new HeadObjectCommand({
            Bucket: intent.bucket,
            Key: intent.r2Key,
          })
        );

        if (typeof head.ContentLength !== 'number' || head.ContentLength !== intent.size) {
          return { success: false, uploadToken: token, error: 'Uploaded object size mismatch' };
        }

        if (head.ContentType && intent.mimeType && head.ContentType !== intent.mimeType) {
          return { success: false, uploadToken: token, error: 'Uploaded object content-type mismatch' };
        }

        await storage.registerUploadedObject(intent.code, intent.r2Key, intent.filename, {
          filename: intent.filename,
          originalName: intent.filename,
          mimeType: intent.mimeType,
          size: intent.size,
          expireAt: intent.expireAt,
          password: intent.password,
          maxDownloads: intent.maxDownloads,
        });

        pendingUploads.delete(token);

        return {
          success: true,
          uploadToken: token,
          code: intent.code,
          filename: intent.filename,
          size: intent.size,
          mimeType: intent.mimeType,
          hasPassword: !!intent.password,
          imageUrl: intent.mimeType.startsWith('image/')
            ? `${req.protocol}://${req.get('host')}/i/${intent.code}`
            : null,
        };
      } catch (error) {
        return {
          success: false,
          uploadToken: token,
          error: error instanceof Error ? error.message : 'Upload completion failed',
        };
      }
    })
  );

  const hasPassword = results.some((result) => {
    return !!(result.success && result.hasPassword);
  });

  res.json({
    success: results.every((result) => result.success),
    files: results.filter((result) => result.success),
    errors: results.filter((result) => !result.success),
    hasPassword,
  });
});

export default router;
