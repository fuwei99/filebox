import { MessageSquare, ArrowLeft } from 'lucide-react';
import { AuthProvider } from './contexts/AuthContext';
import { ChatTab } from './components/chat/ChatTab';

function ChatPageContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white/80 border border-gray-200 text-gray-700 hover:bg-white"
            >
              <ArrowLeft className="w-4 h-4" />
              返回 FileBox
            </a>
            <div className="flex items-center gap-2 text-gray-800">
              <MessageSquare className="w-5 h-5 text-primary-600" />
              <h1 className="text-xl font-bold">聊天室</h1>
            </div>
          </div>
        </header>

        <ChatTab />
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AuthProvider>
      <ChatPageContent />
    </AuthProvider>
  );
}
