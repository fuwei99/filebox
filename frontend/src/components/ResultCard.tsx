import React, { useState } from 'react';
import { Copy, Check, QrCode, Download, Image as ImageIcon, Link } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ResultItem {
  code: string;
  filename: string;
  size: number;
  mimeType: string;
  imageUrl: string | null;
}

interface ResultCardProps {
  files: ResultItem[];
  expireAt: string | null;
  hasPassword: boolean;
  password?: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const ResultCard: React.FC<ResultCardProps> = ({ files, expireAt, hasPassword, password }) => {
  const [copiedCodes, setCopiedCodes] = useState<Set<string>>(new Set());
  const [copiedLinks, setCopiedLinks] = useState<Set<string>>(new Set());
  const [copiedDownloadLinks, setCopiedDownloadLinks] = useState<Set<string>>(new Set());
  const [showQR, setShowQR] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodes((prev) => new Set(prev).add(code));
      setTimeout(() => {
        setCopiedCodes((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const copyDownloadLink = async (code: string) => {
    const baseUrl = `${window.location.origin}/api/download/${code}`;
    const downloadUrl = password
      ? `${baseUrl}?password=${encodeURIComponent(password)}`
      : baseUrl;

    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopiedDownloadLinks((prev) => new Set(prev).add(code));
      setTimeout(() => {
        setCopiedDownloadLinks((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const copyImageLink = async (url: string, code: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinks((prev) => new Set(prev).add(code));
      setTimeout(() => {
        setCopiedLinks((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const downloadQR = (code: string) => {
    const svg = document.getElementById(`qr-${code}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `qrcode-${code}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-lg">上传成功!</h3>
      
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.code}
            className="p-4 bg-gray-50 rounded-lg space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.filename}</p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.size)} · {file.mimeType}
                </p>
              </div>
              {file.imageUrl && (
                <ImageIcon className="w-5 h-5 text-blue-500 ml-2" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-primary-600">
                  {file.code}
                </span>
                <button
                  onClick={() => copyCode(file.code)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  {copiedCodes.has(file.code) ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {file.imageUrl && (
              <div className="flex gap-2">
                <button
                  onClick={() => copyImageLink(file.imageUrl!, file.code)}
                  className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"
                >
                  {copiedLinks.has(file.code) ? (
                    <>
                      <Check className="w-3 h-3" /> 已复制外链
                    </>
                  ) : (
                    <>
                      <Link className="w-3 h-3" /> 复制图床链接
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => copyDownloadLink(file.code)}
                className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"
              >
                {copiedDownloadLinks.has(file.code) ? (
                  <>
                    <Check className="w-3 h-3" /> 已复制下载链接
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" /> 复制下载链接
                  </>
                )}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowQR(showQR === file.code ? null : file.code)}
                className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"
              >
                <QrCode className="w-3 h-3" />
                {showQR === file.code ? '隐藏二维码' : '显示二维码'}
              </button>
              {showQR === file.code && (
                <button
                  onClick={() => downloadQR(file.code)}
                  className="btn-secondary px-3"
                >
                  <Download className="w-3 h-3" />
                </button>
              )}
            </div>

            {showQR === file.code && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG
                  id={`qr-${file.code}`}
                  value={`${window.location.origin}/api/download/${file.code}`}
                  size={160}
                  level="M"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-sm text-gray-500 pt-2 border-t">
        {expireAt ? (
          <p>文件将于 {new Date(expireAt).toLocaleString('zh-CN')} 过期</p>
        ) : (
          <p>文件永久保存</p>
        )}
        {hasPassword && <p className="mt-1">⚠️ 设置了提取密码</p>}
      </div>
    </div>
  );
};
