import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Image, FileText, Lock, Clock, Download } from 'lucide-react';

interface FileItem {
  file: File;
  id: string;
}

interface UploadZoneProps {
  onUpload: (files: File[], options: UploadOptions) => Promise<void>;
  uploading: boolean;
  progress: number;
  maxFileSize?: number;
}

export interface UploadOptions {
  expireHours: number;
  password: string;
  maxDownloads: number | undefined;
}

const getFileIcon = (file: File) => {
  if (file.type.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
  if (file.type.startsWith('text/')) return <FileText className="w-5 h-5 text-green-500" />;
  return <File className="w-5 h-5 text-gray-500" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const UploadZone: React.FC<UploadZoneProps> = ({ onUpload, uploading, progress, maxFileSize = 100 * 1024 * 1024 }) => {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [options, setOptions] = useState<UploadOptions>({
    expireHours: 24,
    password: '',
    maxDownloads: undefined,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const fileArray = Array.from(newFiles);
    const newItems = fileArray.map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
    }));
    setFiles((prev) => [...prev, ...newItems]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    onUpload(
      files.map((item) => item.file),
      options
    );
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleChange}
        />
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 mb-1">
          <span className="font-medium text-primary-600">点击上传</span> 或拖拽文件到此处
        </p>
        <p className="text-sm text-gray-400">支持批量上传，单文件最大 {formatFileSize(maxFileSize)}</p>
      </div>

      {files.length > 0 && (
        <div className="card">
          <h3 className="font-medium mb-3">待上传文件 ({files.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                {getFileIcon(item.file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                </div>
                <button
                  onClick={() => removeFile(item.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                  disabled={uploading}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-medium mb-4">上传选项</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-400" />
            <label className="text-sm font-medium">有效期</label>
            <select
              className="input-field ml-auto"
              value={options.expireHours}
              onChange={(e) =>
                setOptions({ ...options, expireHours: parseInt(e.target.value) })
              }
              disabled={uploading}
            >
              <option value={1}>1小时</option>
              <option value={24}>24小时</option>
              <option value={168}>7天</option>
              <option value={0}>永久</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-gray-400" />
            <label className="text-sm font-medium">提取密码</label>
            <input
              type="text"
              className="input-field flex-1 ml-4"
              placeholder="留空则不设置"
              value={options.password}
              onChange={(e) => setOptions({ ...options, password: e.target.value })}
              maxLength={20}
              disabled={uploading}
            />
          </div>

          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-gray-400" />
            <label className="text-sm font-medium">下载次数限制</label>
            <select
              className="input-field ml-auto"
              value={options.maxDownloads || ''}
              onChange={(e) =>
                setOptions({
                  ...options,
                  maxDownloads: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              disabled={uploading}
            >
              <option value="">不限制</option>
              <option value={1}>1次</option>
              <option value={5}>5次</option>
              <option value={10}>10次</option>
              <option value={50}>50次</option>
            </select>
          </div>
        </div>
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>上传中...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        className="btn-primary w-full"
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
      >
        {uploading ? '上传中...' : `上传 ${files.length > 0 ? `(${files.length})` : ''}`}
      </button>
    </div>
  );
};
