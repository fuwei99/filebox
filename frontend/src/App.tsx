import { useState, useEffect } from 'react';
import { Upload, Download, FileBox, Github, MessageSquare } from 'lucide-react';
import { UploadZone, UploadOptions } from './components/UploadZone';
import { DownloadForm } from './components/DownloadForm';
import { ResultCard } from './components/ResultCard';
import { HistoryList } from './components/HistoryList';
import { uploadFile, uploadBatch } from './api';

type Tab = 'upload' | 'download';

interface UploadResult {
  files: {
    code: string;
    filename: string;
    size: number;
    mimeType: string;
    imageUrl: string | null;
  }[];
  expireAt: string | null;
  hasPassword: boolean;
  password?: string;
}

interface HistoryItem {
  code: string;
  filename: string;
  uploadTime: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');

  // 加载历史记录
  useEffect(() => {
    const saved = localStorage.getItem('filebox_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }
  }, []);

  // 保存历史记录
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem('filebox_history', JSON.stringify(newHistory.slice(0, 50)));
  };

  const handleUpload = async (files: File[], options: UploadOptions) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      if (files.length === 1) {
        // 单文件上传
        const result = await uploadFile(files[0], options, setUploadProgress);
        setUploadProgress(100);
        setUploadResult({
          files: [{
            code: result.code,
            filename: result.filename,
            size: result.size,
            mimeType: result.mimeType,
            imageUrl: result.imageUrl,
          }],
          expireAt: result.expireAt,
          hasPassword: result.hasPassword,
          password: options.password || undefined,
        });

        // 添加到历史
        const newHistory = [{
          code: result.code,
          filename: result.filename,
          uploadTime: new Date().toISOString(),
        }, ...history];
        saveHistory(newHistory);
      } else {
        // 批量上传
        const result = await uploadBatch(files, options, setUploadProgress);
        setUploadProgress(100);
        setUploadResult({
          files: result.files,
          expireAt: result.expireAt,
          hasPassword: result.hasPassword,
          password: options.password || undefined,
        });

        // 添加到历史
        const newItems = result.files.map(f => ({
          code: f.code,
          filename: f.filename,
          uploadTime: new Date().toISOString(),
        }));
        saveHistory([...newItems, ...history]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const clearHistory = () => {
    saveHistory([]);
  };

  const handleHistorySelect = (code: string) => {
    setSelectedCode(code);
    setActiveTab('download');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center">
              <FileBox className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">FileBox</h1>
          </div>
          <p className="text-gray-600">简单快速的文件传递与图床服务</p>
          <a
            href="/chat"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-white/80 border border-primary-200 text-primary-700 hover:bg-white transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            进入聊天室（新页面）
          </a>
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-2 p-1 bg-gray-200 rounded-xl mb-6">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload className="w-4 h-4" />
            上传文件
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${
              activeTab === 'download'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            onClick={() => setActiveTab('download')}
          >
            <Download className="w-4 h-4" />
            提取文件
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'upload' ? (
            uploadResult ? (
              <>
                <ResultCard
                  files={uploadResult.files}
                  expireAt={uploadResult.expireAt}
                  hasPassword={uploadResult.hasPassword}
                  password={uploadResult.password}
                />
                <button
                  className="btn-secondary w-full"
                  onClick={() => setUploadResult(null)}
                >
                  继续上传
                </button>
              </>
            ) : (
              <UploadZone
                onUpload={handleUpload}
                uploading={uploading}
                progress={uploadProgress}
              />
            )
          ) : (
            <DownloadForm key={selectedCode} onSuccess={() => setSelectedCode('')} />
          )}

          <HistoryList
            history={history}
            onClear={clearHistory}
            onSelect={handleHistorySelect}
          />
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p className="flex items-center justify-center gap-2">
            <Github className="w-4 h-4" />
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-600"
            >
              FileBox
            </a>
          </p>
          <p className="mt-1">文件存储于内存，重启后数据将丢失</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

