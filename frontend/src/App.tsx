import { useState, useEffect } from 'react';
import { Upload, Download, FileBox, Github, MessageSquare, Lock, LogOut, X, AlertCircle, CheckCircle } from 'lucide-react';
import { UploadZone, UploadOptions } from './components/UploadZone';
import { DownloadForm } from './components/DownloadForm';
import { ResultCard } from './components/ResultCard';
import { HistoryList } from './components/HistoryList';
import { uploadFile, uploadBatch, getConfig } from './api';
import { useServerAuth } from './contexts/ServerAuthContext';

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

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 space-y-2 w-full max-w-sm px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border backdrop-blur-sm ${
            toast.type === 'error'
              ? 'bg-red-50/95 border-red-200 text-red-800'
              : toast.type === 'success'
                ? 'bg-green-50/95 border-green-200 text-green-800'
                : 'bg-blue-50/95 border-blue-200 text-blue-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          ) : toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-blue-500" />
          )}
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="p-1 hover:bg-black/5 rounded-full shrink-0 transition-colors"
          >
            <X className="w-4 h-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ServerLoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(password);
    } catch {
      setError('密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">服务器登录</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">服务器密码</label>
            <input
              type="password"
              className="input-field w-full"
              placeholder="请输入服务器密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={!password || loading}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const { isAuthEnabled, isServerAuthed, showLoginModal, login, logout, requestLogin, closeLoginModal } = useServerAuth();
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [maxFileSize, setMaxFileSize] = useState<number>(100 * 1024 * 1024);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 加载历史记录和配置
  useEffect(() => {
    const saved = localStorage.getItem('filebox_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }
    getConfig().then((config) => {
      setMaxFileSize(config.maxFileSize);
    }).catch(() => {
      // fallback to default
    });
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
    } catch (error: any) {
      console.error('Upload failed:', error);
      if (error.response?.status === 401) {
        addToast('请先登录服务器', 'error');
        requestLogin();
      } else if (error.response?.status === 413) {
        const serverMaxFileSize = error.response?.data?.maxFileSize;
        const responseContentType = error.response?.headers?.['content-type'];
        const isHtml413 = typeof responseContentType === 'string' && responseContentType.includes('text/html');

        if (isHtml413) {
          console.error('[upload-client] 413 returned as HTML, likely blocked by upstream proxy before backend route');
          addToast('上传被网关/代理拦截（413），请求可能未到后端。请检查部署平台上传大小限制。', 'error');
          return;
        }

        if (typeof serverMaxFileSize === 'number' && serverMaxFileSize > 0) {
          addToast(`文件过大，最大允许 ${formatFileSize(serverMaxFileSize)}`, 'error');
        } else {
          addToast(`文件过大，最大允许 ${formatFileSize(maxFileSize)}`, 'error');
        }
      } else if (error.response?.data?.error) {
        addToast(error.response.data.error, 'error');
      } else {
        addToast('上传失败，请检查网络后重试', 'error');
      }
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
            {isAuthEnabled && (
              isServerAuthed ? (
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors text-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  已登录
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={requestLogin}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors text-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  登录
                </button>
              )
            )}
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
                maxFileSize={maxFileSize}
                onValidationError={(message) => addToast(message, 'error')}
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
      {showLoginModal && (
        <ServerLoginModal onClose={closeLoginModal} onLogin={login} />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;

