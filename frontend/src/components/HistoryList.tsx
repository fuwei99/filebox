import React from 'react';
import { Clock, Trash2, Download } from 'lucide-react';

interface HistoryItem {
  code: string;
  filename: string;
  uploadTime: string;
}

interface HistoryListProps {
  history: HistoryItem[];
  onClear: () => void;
  onSelect: (code: string) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ history, onClear, onSelect }) => {
  if (history.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2">
          <Clock className="w-4 h-4" />
          上传历史
        </h3>
        <button
          onClick={onClear}
          className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          清空
        </button>
      </div>
      <div className="space-y-2">
        {history.slice(0, 10).map((item) => (
          <div
            key={item.code}
            className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() => onSelect(item.code)}
          >
            <Download className="w-4 h-4 text-gray-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.filename}</p>
              <p className="text-xs text-gray-500">
                {item.code} · {new Date(item.uploadTime).toLocaleDateString('zh-CN')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
