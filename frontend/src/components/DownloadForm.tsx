import React, { useState } from 'react';
import { Download, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { getFileInfo, downloadFile } from '../api';
import type { FileInfo } from '../api';

interface DownloadFormProps {
  onSuccess?: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

export const DownloadForm: React.FC<DownloadFormProps> = ({ onSuccess }) => {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCheck = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const info = await getFileInfo(code.trim());
      setFileInfo(info);
    } catch (err: any) {
      setError(err.response?.data?.error || '文件码无效或文件已过期');
      setFileInfo(null);
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (!fileInfo) return;
    if (fileInfo.hasPassword && !password) {
      setError('请输入提取密码');
      return;
    }
    const url = downloadFile(code.trim(), password || undefined);
    window.open(url, '_blank');
    setTimeout(() => {
      setFileInfo(null);
      setCode('');
      setPassword('');
      onSuccess?.();
    }, 500);
  };

  const copyLink = async () => {
    if (!fileInfo) return;
    const url = `${window.location.origin}${downloadFile(code.trim(), password || undefined)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">文件码</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="input-field flex-1"
            placeholder="请输入6位文件码"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFileInfo(null);
              setError('');
            }}
            maxLength={6}
            disabled={loading}
          />
          <button
            className="btn-primary"
            onClick={handleCheck}
            disabled={!code.trim() || loading}
          >
            {loading ? '查询中...' : '查询'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {fileInfo && (
        <div className="card bg-primary-50 border-primary-200">
          <h3 className="font-medium mb-3 text-primary-900">文件信息</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-600">文件名：</span>{fileInfo.filename}</p>
            <p><span className="text-gray-600">大小：</span>{formatFileSize(fileInfo.size)}</p>
            <p><span className="text-gray-600">上传时间：</span>{formatTime(fileInfo.uploadTime)}</p>
            {fileInfo.expireAt && (
              <p><span className="text-gray-600">过期时间：</span>{formatTime(fileInfo.expireAt)}</p>
            )}
            <p><span className="text-gray-600">下载次数：</span>
              {fileInfo.downloadCount}
              {fileInfo.maxDownloads && ` / ${fileInfo.maxDownloads}`}
            </p>
          </div>

          {fileInfo.hasPassword && (
            <div className="mt-4">
              <label className="text-sm font-medium">提取密码</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field w-full pr-10"
                  placeholder="请输入提取密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          )}

          {fileInfo.isImage && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">图片预览：</p>
              <img
                src={`/api/download/preview/${code.trim()}${password ? `?password=${encodeURIComponent(password)}` : ''}`}
                alt={fileInfo.filename}
                className="max-w-full max-h-48 rounded-lg border border-gray-200"
              />
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4" />
              下载文件
            </button>
            <button
              className="btn-secondary flex items-center justify-center gap-2"
              onClick={copyLink}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
