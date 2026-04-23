import express from 'express';
import multer from 'multer';
import { appConfig } from '../config.js';
import { storage } from '../storage/index.js';
import { generateCode } from '../utils/code.js';

const router = express.Router();
const normalizeFilename = (filename: string): string => {
  return Buffer.from(filename, 'latin1').toString('utf8');
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: appConfig.maxFileSize,
  },
});

// 单文件上传
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { expireHours, password, maxDownloads } = req.body;
    const code = generateCode();
    const originalName = normalizeFilename(req.file.originalname);

    const expireAt = expireHours && expireHours !== '0'
      ? new Date(Date.now() + parseInt(expireHours) * 60 * 60 * 1000)
      : null;

    await storage.upload(
      code,
      req.file.buffer,
      originalName,
      {
        filename: originalName,
        originalName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        expireAt,
        password: password || null,
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      }
    );

    const imageUrl = req.file.mimetype.startsWith('image/')
      ? `${req.protocol}://${req.get('host')}/i/${code}`
      : null;

    res.json({
      success: true,
      code,
      filename: originalName,
      size: req.file.size,
      mimeType: req.file.mimetype,
      expireAt,
      hasPassword: !!password,
      maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
      imageUrl,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 批量上传
router.post('/batch', upload.array('files', appConfig.maxBatchSize), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { expireHours, password, maxDownloads } = req.body;
    const expireAt = expireHours && expireHours !== '0'
      ? new Date(Date.now() + parseInt(expireHours) * 60 * 60 * 1000)
      : null;

    const results = await Promise.all(
      files.map(async (file) => {
        const code = generateCode();
        const originalName = normalizeFilename(file.originalname);
        await storage.upload(
          code,
          file.buffer,
          originalName,
          {
            filename: originalName,
            originalName,
            mimeType: file.mimetype,
            size: file.size,
            expireAt,
            password: password || null,
            maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
          }
        );

        const imageUrl = file.mimetype.startsWith('image/')
          ? `${req.protocol}://${req.get('host')}/i/${code}`
          : null;

        return {
          code,
          filename: originalName,
          size: file.size,
          mimeType: file.mimetype,
          imageUrl,
        };
      })
    );

    res.json({
      success: true,
      files: results,
      expireAt,
      hasPassword: !!password,
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    res.status(500).json({ error: 'Batch upload failed' });
  }
});

export default router;
