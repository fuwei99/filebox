import { useState } from 'react';
import { X, Lock, Users, Clock } from 'lucide-react';
import * as chatApi from '../../api/chat';
import type { Room } from '../../api/chat';

interface CreateRoomModalProps {
  onClose: () => void;
  onCreated: (room: Room) => void;
}

type RoomExpirePreset = '1h' | '24h' | '7d' | '30d' | 'permanent' | 'custom';

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onClose, onCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    maxMembers: 50,
    password: '',
    hasPassword: false,
  });
  const [expirePreset, setExpirePreset] = useState<RoomExpirePreset>('24h');
  const [customExpireValue, setCustomExpireValue] = useState<number>(1);
  const [customExpireUnit, setCustomExpireUnit] = useState<'hour' | 'day'>('hour');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const buildExpireHours = (): number | null => {
    if (expirePreset === 'custom') {
      const value = Number.isFinite(customExpireValue) && customExpireValue >= 0 ? customExpireValue : 0;
      if (value === 0) return null;
      return customExpireUnit === 'day' ? value * 24 : value;
    }

    const presetHoursMap: Record<Exclude<RoomExpirePreset, 'custom'>, number | null> = {
      '1h': 1,
      '24h': 24,
      '7d': 168,
      '30d': 720,
      permanent: null,
    };

    return presetHoursMap[expirePreset];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await chatApi.createRoom({
        name: formData.name,
        maxMembers: formData.maxMembers,
        password: formData.hasPassword ? formData.password : undefined,
        expireHours: buildExpireHours(),
      });

      if (response.success) {
        onCreated(response.room);
      } else {
        setError(response.error || '创建失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">创建聊天房间</h3>
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
            <label className="block text-sm font-medium mb-1">房间名称</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="输入房间名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1">
              <Users className="w-4 h-4" />
              人数上限
            </label>
            <select
              className="input-field w-full"
              value={formData.maxMembers}
              onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value) })}
            >
              <option value={5}>5人</option>
              <option value={10}>10人</option>
              <option value={20}>20人</option>
              <option value={50}>50人</option>
              <option value={100}>100人</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              有效期
            </label>
            <select
              className="input-field w-full"
              value={expirePreset}
              onChange={(e) => setExpirePreset(e.target.value as RoomExpirePreset)}
            >
              <option value="1h">1小时</option>
              <option value="24h">24小时</option>
              <option value="7d">7天</option>
              <option value="30d">30天</option>
              <option value="permanent">永久</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          {expirePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-field flex-1"
                value={customExpireValue}
                min={0}
                step={1}
                onChange={(e) => setCustomExpireValue(Number(e.target.value || 0))}
              />
              <select
                className="input-field w-28"
                value={customExpireUnit}
                onChange={(e) => setCustomExpireUnit(e.target.value as 'hour' | 'day')}
              >
                <option value="hour">小时</option>
                <option value="day">天</option>
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasPassword}
                onChange={(e) => setFormData({ ...formData, hasPassword: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium flex items-center gap-1">
                <Lock className="w-4 h-4" />
                设置房间密码
              </span>
            </label>
          </div>

          {formData.hasPassword && (
            <div>
              <label className="block text-sm font-medium mb-1">密码</label>
              <input
                type="password"
                className="input-field w-full"
                placeholder="设置房间密码"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={formData.hasPassword}
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
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
