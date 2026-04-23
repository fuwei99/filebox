import express from 'express';
import QRCode from 'qrcode';
import { storage } from '../storage/index.js';

const router = express.Router();

// 获取文件信息
router.get('/info/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const metadata = await storage.getInfo(code);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    res.json({
      success: true,
      filename: metadata.originalName,
      size: metadata.size,
      mimeType: metadata.mimeType,
      uploadTime: metadata.uploadTime,
      expireAt: metadata.expireAt,
      hasPassword: !!metadata.password,
      maxDownloads: metadata.maxDownloads,
      downloadCount: metadata.downloadCount,
      isImage: metadata.mimeType.startsWith('image/'),
    });
  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// 生成二维码
router.get('/qrcode/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const url = `${req.protocol}://${req.get('host')}/api/download/${code}`;

    const qrCodeDataUrl = await QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
    });

    res.json({
      success: true,
      qrcode: qrCodeDataUrl,
    });
  } catch (error) {
    console.error('QRCode error:', error);
    res.status(500).json({ error: 'Failed to generate QRCode' });
  }
});

// 下载文件
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.query;

    const fileData = await storage.download(code);

    if (!fileData) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const { buffer, metadata } = fileData;

    // 验证密码
    if (metadata.password && metadata.password !== password) {
      return res.status(403).json({ error: 'Password required or incorrect' });
    }

    // 增加下载次数
    await storage.incrementDownload(code);

    // 设置响应头
    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Length', metadata.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.originalName)}"`);

    res.send(buffer);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// 预览文件（无需下载次数统计）
router.get('/preview/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.query;

    const fileData = await storage.download(code);

    if (!fileData) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const { buffer, metadata } = fileData;

    if (metadata.password && metadata.password !== password) {
      return res.status(403).json({ error: 'Password required or incorrect' });
    }

    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Length', metadata.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.send(buffer);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Preview failed' });
  }
});

export default router;
