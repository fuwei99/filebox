import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, LogIn, Sparkles } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'guest';

export const AuthForm: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('guest');
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    password: '',
    confirmPassword: '',
    avatarEmoji: '�',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register, guestLogin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(formData.username, formData.password);
      } else if (mode === 'register') {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        await register({
          username: formData.username,
          nickname: formData.nickname || formData.username,
          password: formData.password,
          avatarEmoji: formData.avatarEmoji,
        });
      } else if (mode === 'guest') {
        if (!formData.nickname.trim()) {
          throw new Error('请输入昵称');
        }
        await guestLogin({
          nickname: formData.nickname.trim(),
          avatarEmoji: formData.avatarEmoji,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const emojiOptions = ['', '😎', '🤖', '👻', '🐱', '🐶', '🦊', '🐼', '🐨', '🦄', '🌟', '🔥', '🎮', '📱', '💻'];

  const getTitle = () => {
    switch (mode) {
      case 'login': return '登录';
      case 'register': return '注册账号';
      case 'guest': return '快速进入';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'login': return '登录以使用聊天功能';
      case 'register': return '创建账号保存聊天记录';
      case 'guest': return '选择头像和昵称直接开始，无需注册';
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
        <button
          type="button"
          onClick={() => { setMode('guest'); setError(''); }}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'guest'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Sparkles className="w-4 h-4 inline-block mr-1" />
          游客模式
        </button>
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'login'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'register'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          注册
        </button>
      </div>

      <div className="text-center mb-6">
        <h3 className="text-xl font-bold mb-2">{getTitle()}</h3>
        <p className="text-gray-500 text-sm">{getSubtitle()}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nickname field - shown for guest and register modes */}
        {(mode === 'guest' || mode === 'register') && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {mode === 'guest' ? '昵称 *' : '昵称'}
            </label>
            <input
              type="text"
              className="input-field w-full"
              placeholder={mode === 'guest' ? '怎么称呼你？' : '显示名称'}
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              required={mode === 'guest'}
              maxLength={20}
            />
          </div>
        )}

        {/* Avatar emoji - shown for guest and register modes */}
        {(mode === 'guest' || mode === 'register') && (
          <div>
            <label className="block text-sm font-medium mb-2">选择头像</label>
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
        )}

        {/* Username field - only for login and register */}
        {(mode === 'login' || mode === 'register') && (
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
        )}

        {/* Password field - only for login and register */}
        {(mode === 'login' || mode === 'register') && (
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              className="input-field w-full"
              placeholder={mode === 'login' ? '密码' : '至少6个字符'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
        )}

        {/* Confirm password - only for register */}
        {mode === 'register' && (
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
          ) : mode === 'login' ? (
            <>
              <LogIn className="w-4 h-4" />
              登录
            </>
          ) : mode === 'register' ? (
            <>
              <UserPlus className="w-4 h-4" />
              注册
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              立即进入
            </>
          )}
        </button>
      </form>

      {mode === 'guest' && (
        <div className="mt-4 text-center text-xs text-gray-500">
          <p>游客模式无需注册，但数据仅保存在当前浏览器</p>
        </div>
      )}
    </div>
  );
};
