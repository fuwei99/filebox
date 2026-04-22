import express from 'express';
import { storage } from '../storage/memory.js';

const router = express.Router();

// 图床外链 - 直接显示图片
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const fileData = await storage.download(code);

    if (!fileData) {
      return res.status(404).send('Image not found');
    }

    const { buffer, metadata } = fileData;

    // 只允许图片类型的文件
    if (!metadata.mimeType.startsWith('image/')) {
      return res.status(400).send('Not an image file');
    }

    // 设置缓存头，让浏览器缓存图片
    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Length', metadata.size);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24小时缓存

    res.send(buffer);
  } catch (error) {
    console.error('Image error:', error);
    res.status(500).send('Failed to load image');
  }
});

export default router;
