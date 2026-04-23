import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, LogIn } from 'lucide-react';

export const AuthForm: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    password: '',
    confirmPassword: '',
    avatarEmoji: '👤',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(formData.username, formData.password);
      } else {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        await register({
          username: formData.username,
          nickname: formData.nickname || formData.username,
          password: formData.password,
          avatarEmoji: formData.avatarEmoji,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const emojiOptions = ['👤', '😀', '😎', '🤖', '👻', '🐱', '🐶', '🦊', '🐼', '🐨'];

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold mb-2">
          {isLogin ? '登录' : '注册'}
        </h3>
        <p className="text-gray-500 text-sm">
          {isLogin ? '登录以使用聊天功能' : '创建账号开始聊天'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">昵称</label>
              <input
                type="text"
                className="input-field w-full"
                placeholder="显示名称"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">头像</label>
              <div className="flex gap-2 flex-wrap">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormData({ ...formData, avatarEmoji: emoji })}
                    className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                      formData.avatarEmoji === emoji
                        ? 'bg-primary-100 border-2 border-primary-500'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">用户名</label>
          <input
            type="text"
            className="input-field w-full"
            placeholder="3-20个字符"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            minLength={3}
            maxLength={20}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">密码</label>
          <input
            type="password"
            className="input-field w-full"
            placeholder={isLogin ? '密码' : '至少6个字符'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            minLength={6}
          />
        </div>

        {!isLogin && (
          <div>
            <label className="block text-sm font-medium mb-1">确认密码</label>
            <input
              type="password"
              className="input-field w-full"
              placeholder="再次输入密码"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
            />
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full flex items-center justify-center gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            '处理中...'
          ) : isLogin ? (
            <>
              <LogIn className="w-4 h-4" />
              登录
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              注册
            </>
          )}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
          }}
          className="text-primary-600 text-sm hover:underline"
        >
          {isLogin ? '没有账号？立即注册' : '已有账号？立即登录'}
        </button>
      </div>
    </div>
  );
};
