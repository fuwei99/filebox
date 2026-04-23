#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function normalizeEndpoint(endpoint) {
  const raw = (endpoint || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }
  return `https://${raw}`.replace(/\/+$/, '');
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const cwd = process.cwd();
  const configPath = process.argv[2]
    ? path.resolve(cwd, process.argv[2])
    : path.resolve(cwd, 'config.json');
  const filePath = process.argv[3]
    ? path.resolve(cwd, process.argv[3])
    : path.resolve(cwd, 'tmp-test.txt');

  console.log(`[*] 使用配置: ${configPath}`);
  console.log(`[*] 测试文件: ${filePath}`);

  const config = loadConfig(configPath);
  const r2 = (config && config.r2) || {};

  const endpoint = normalizeEndpoint(r2.endpoint);
  const accessKeyId = (r2.accessKeyId || '').trim();
  const secretAccessKey = (r2.secretAccessKey || '').trim();
  const bucketName = (r2.bucketName || '').trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('config.json 的 r2 配置不完整，需要 endpoint/accessKeyId/secretAccessKey/bucketName');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`测试文件不存在: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const objectKey = `speed-test/${Date.now()}-${crypto.randomUUID()}-${path.basename(filePath)}`;

  console.log('\n=== 上传测试 ===');
  console.log(`endpoint: ${endpoint}`);
  console.log(`bucket:   ${bucketName}`);
  console.log(`key:      ${objectKey}`);
  console.log(`size:     ${formatBytes(fileSize)} (${fileSize} bytes)`);

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const bodyStream = fs.createReadStream(filePath);
  const startedAt = process.hrtime.bigint();
  let uploaded = false;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: bodyStream,
        ContentLength: fileSize,
        ContentType: 'application/octet-stream',
      })
    );
    uploaded = true;

    const endedAt = process.hrtime.bigint();
    const seconds = Number(endedAt - startedAt) / 1e9;
    const mbps = (fileSize * 8) / (seconds * 1024 * 1024);
    const mBs = fileSize / (seconds * 1024 * 1024);

    console.log('\n=== 结果 ===');
    console.log(`[OK] 上传成功`);
    console.log(`耗时: ${seconds.toFixed(2)} 秒`);
    console.log(`平均速度: ${mBs.toFixed(2)} MB/s (${mbps.toFixed(2)} Mbps)`);
  } finally {
    if (uploaded) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
          })
        );
        console.log(`[OK] 已删除 R2 测试对象: ${objectKey}`);
      } catch (err) {
        console.error(`[WARN] 上传成功但删除失败，请手动删除: ${objectKey}`);
        console.error(String(err && err.message ? err.message : err));
      }
    }
  }
}

main().catch((err) => {
  console.error('\n[FAIL] 测试失败');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
