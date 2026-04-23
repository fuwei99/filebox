import { useState } from 'react';
import { X, Lock, Hash } from 'lucide-react';
import * as chatApi from '../../api/chat';
import type { Room } from '../../api/chat';

interface JoinRoomModalProps {
  onClose: () => void;
  onJoined: (room: Room) => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ onClose, onJoined }) => {
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await chatApi.joinRoom(roomCode, password || undefined);
      if (response.success) {
        // Get room details
        const roomResponse = await chatApi.getRoom(roomCode);
        if (roomResponse.success) {
          onJoined(roomResponse.room);
        }
      } else {
        setError(response.error || '加入失败');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加入失败';
      if (message.includes('password') || message.includes('密码')) {
        setNeedsPassword(true);
        setError('该房间需要密码');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">加入聊天房间</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1">
              <Hash className="w-4 h-4" />
              房间码
            </label>
            <input
              type="text"
              className="input-field w-full uppercase"
              placeholder="输入6位房间码"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />
          </div>

          {(needsPassword || error?.includes('密码')) && (
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                <Lock className="w-4 h-4" />
                房间密码
              </label>
              <input
                type="password"
                className="input-field w-full"
                placeholder="输入房间密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={isLoading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isLoading || roomCode.length !== 6}
            >
              {isLoading ? '加入中...' : '加入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
