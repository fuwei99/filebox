import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, Send, Paperclip, File, Users, Settings, Copy, Check, Archive, Trash2, RotateCcw, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import * as chatApi from '../../api/chat';
import { uploadFile } from '../../api';
import type { Room, Message, RoomDetail } from '../../api/chat';

interface ChatRoomProps {
  room: Room;
  onBack: () => void;
  socketRef: React.MutableRefObject<Socket | null>;
  onRoomUpdated: (room: Room) => void;
  onRoomDeleted: (roomCode: string) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ room, onBack, socketRef, onRoomUpdated, onRoomDeleted }) => {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOperating, setIsOperating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle copy message content
  const handleCopyMessage = async (message: Message) => {
    let textToCopy = '';
    if (message.type === 'text') {
      textToCopy = message.content;
    } else if (message.type === 'file') {
      textToCopy = `${message.fileName || '文件'}: ${window.location.origin}/api/download/${message.content}`;
    } else if (message.type === 'image') {
      textToCopy = `${window.location.origin}/i/${message.content}`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    } catch {
      // Copy failed, ignore
    }
  };

  // Initialize socket connection
  useEffect(() => {
    if (!token) return;

    const socket = io('/', {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] Connected');
      socket.emit('join-room', { roomCode: room.code });
    });

    socket.on('receive-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('user-joined', (data) => {
      console.log('[socket] User joined:', data);
    });

    socket.on('user-left', (data) => {
      console.log('[socket] User left:', data);
    });

    socket.on('error', (error) => {
      console.error('[socket] Error:', error);
    });

    return () => {
      socket.emit('leave-room', { roomCode: room.code });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [room.code, token, socketRef]);

  const isOwner = (roomDetail?.creatorId || room.creatorId) === user?.id;
  const roomStatus = roomDetail?.status || room.status;
  const isReadOnly = roomStatus !== 'active';
  const roomJoinText = room.code.toUpperCase();
  const roomJoinUrl = `${window.location.origin}/chat?room=${room.code}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomJoinText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setActionError('复制失败，请手动复制房间码');
    }
  };

  const handleArchiveRoom = async () => {
    try {
      setIsOperating(true);
      setActionError('');
      await chatApi.endRoom(room.code, true);
      const updatedRoom: Room = { ...room, status: 'archived' };
      onRoomUpdated(updatedRoom);
      await loadRoomDetail();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '存档失败');
    } finally {
      setIsOperating(false);
    }
  };

  const handleReopenRoom = async () => {
    try {
      setIsOperating(true);
      setActionError('');
      await chatApi.reopenRoom(room.code);
      const updatedRoom: Room = { ...room, status: 'active' };
      onRoomUpdated(updatedRoom);
      await loadRoomDetail();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '恢复失败');
    } finally {
      setIsOperating(false);
    }
  };

  const handleDeleteRoom = async () => {
    const confirmed = window.confirm('确认丢弃该房间吗？丢弃后不可恢复。');
    if (!confirmed) return;

    try {
      setIsOperating(true);
      setActionError('');
      await chatApi.endRoom(room.code, false);
      onRoomDeleted(room.code);
      setShowSettings(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '丢弃失败');
    } finally {
      setIsOperating(false);
    }
  };

  // Load initial messages and room details
  useEffect(() => {
    loadMessages();
    loadRoomDetail();
  }, [room.code]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const response = await chatApi.getMessages(room.code, 50);
      if (response.success) {
        setMessages(response.messages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRoomDetail = async () => {
    try {
      const response = await chatApi.getRoom(room.code);
      if (response.success) {
        setRoomDetail(response.room);
      }
    } catch (error) {
      console.error('Failed to load room detail:', error);
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || !socketRef.current || roomStatus !== 'active') return;

    socketRef.current.emit('send-message', {
      roomCode: room.code,
      type: 'text',
      content: inputText.trim(),
    });

    setInputText('');
  };

  const uploadAndSendFile = async (file: File) => {
    if (!socketRef.current || roomStatus !== 'active') return;

    try {
      const data = await uploadFile(file, {
        scope: 'chat',
      });

      const isImage = file.type.startsWith('image/');
      socketRef.current.emit('send-message', {
        roomCode: room.code,
        type: isImage ? 'image' : 'file',
        content: data.code,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadAndSendFile(file);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (roomStatus !== 'active') return;

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    for (const file of Array.from(droppedFiles)) {
      await uploadAndSendFile(file);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    if (date >= todayStart) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    if (date >= yesterdayStart && date < todayStart) {
      const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return `昨天 ${time}`;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatFileSize = (size?: number) => {
    if (!size || size <= 0) return '文件';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const shouldShowTime = (index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].timestamp).getTime();
    const previous = new Date(messages[index - 1].timestamp).getTime();
    return current - previous >= 5 * 60 * 1000;
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 hover:bg-gray-100 rounded-lg lg:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h4 className="font-medium">{room.name}</h4>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              <span>{roomDetail?.members.length || 0} 人在线</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${roomStatus === 'active' ? 'bg-green-100 text-green-700' : roomStatus === 'archived' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {roomStatus === 'active' ? '进行中' : roomStatus === 'archived' ? '已存档(只读)' : '已丢弃'}
          </span>
          <button
            onClick={() => {
              setActionError('');
              setShowSettings(true);
            }}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            title="房间设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">加载消息中...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            暂无消息，开始聊天吧
          </div>
        ) : (
          messages.map((message, index) => {
            const isMe = message.sender.id === user?.id;
            const showAvatar = index === 0 || messages[index - 1].sender.id !== message.sender.id;
            const showTime = shouldShowTime(index);

            return (
              <div key={message.id}>
                {showTime && (
                  <div className="text-center text-xs text-gray-400 mb-2">
                    {formatTime(message.timestamp)}
                  </div>
                )}

                <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar + Nickname */}
                  <div className="w-14 flex-shrink-0 flex flex-col items-center">
                    {showAvatar && (
                      <span className="text-[11px] text-gray-500 mb-1 max-w-[56px] truncate">
                        {message.sender.nickname}
                      </span>
                    )}
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm">
                      {message.sender.avatarEmoji || '👤'}
                    </div>
                  </div>

                  {/* Message content */}
                  <div className={`max-w-[75%] sm:max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col group`}>
                    <div
                      className={`relative px-3 py-2 rounded-lg ${
                        isMe
                          ? 'bg-primary-500 text-white rounded-br-none'
                          : 'bg-gray-100 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <span
                        className={`absolute top-3 w-2 h-2 rotate-45 ${
                          isMe ? 'right-[-4px] bg-primary-500' : 'left-[-4px] bg-gray-100'
                        }`}
                      />
                      {message.type === 'text' && <p className="text-sm break-all whitespace-pre-wrap relative z-10 pr-6">{message.content}</p>}
                      {message.type === 'image' && (
                        <img
                          src={`/i/${message.content}`}
                          alt="图片"
                          className="max-w-full rounded cursor-pointer relative z-10"
                          onClick={() => window.open(`/api/download/preview/${message.content}`, '_blank')}
                        />
                      )}
                      {message.type === 'file' && (
                        <a
                          href={`/api/download/${message.content}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`relative z-10 min-w-[180px] sm:min-w-[220px] max-w-[260px] sm:max-w-[320px] rounded-md px-3 py-2 flex items-center gap-3 transition-opacity hover:opacity-90 ${
                            isMe ? 'bg-white/15 text-white' : 'bg-white text-gray-800 border border-gray-200'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${isMe ? 'bg-white/20' : 'bg-gray-100'}`}>
                            <File className={`w-5 h-5 ${isMe ? 'text-white' : 'text-gray-600'}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{message.fileName || '未命名文件'}</div>
                            <div className={`text-xs mt-0.5 ${isMe ? 'text-white/80' : 'text-gray-500'}`}>
                              {formatFileSize(message.fileSize)} · 点击下载
                            </div>
                          </div>
                        </a>
                      )}
                    </div>
                    {/* Copy button */}
                    <button
                      onClick={() => handleCopyMessage(message)}
                      className={`mt-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                        copiedMessageId === message.id
                          ? 'text-green-600'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title="复制"
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-gray-100">
        {isReadOnly && (
          <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            当前房间已存档，仅可查看历史消息。{isOwner ? '你可以在设置中恢复房间继续聊天。' : '请联系房主恢复房间。'}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="发送文件或图片"
            disabled={isReadOnly}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <div
            className={`flex-1 rounded-lg transition-colors ${isDragOver ? 'ring-2 ring-primary-400 bg-primary-50/50' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={handleDrop}
          >
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入消息...（Enter发送，Shift+Enter换行）"
              className="input-field w-full min-h-[42px] max-h-40 resize-none"
              rows={2}
              disabled={isReadOnly}
            />
            {isDragOver && (
              <div className="text-xs text-primary-600 px-2 pb-1">释放即可发送文件</div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isReadOnly}
            className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h5 className="font-semibold">房间设置</h5>
              <button className="p-1 rounded hover:bg-gray-100" onClick={() => setShowSettings(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500 mb-1">房间码</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono font-semibold text-primary-700 text-lg tracking-wider">{roomJoinText}</code>
                  <button onClick={handleCopyCode} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50">
                    <Copy className="w-3 h-3" />
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3 flex justify-center">
                <div className="text-center">
                  <QRCodeSVG value={roomJoinUrl} size={128} />
                  <div className="text-xs text-gray-500 mt-2">扫码可快速进入聊天室</div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="text-xs text-gray-500">关闭房间</div>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    onBack();
                  }}
                  className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-gray-50 border border-gray-200"
                >
                  暂存（仅关闭当前窗口）
                </button>

                {isOwner && roomStatus === 'active' && (
                  <button
                    onClick={handleArchiveRoom}
                    disabled={isOperating}
                    className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-amber-50 border border-amber-200 text-amber-700 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <Archive className="w-4 h-4" />
                    存档（可继续加入，但不可发送）
                  </button>
                )}

                {isOwner && roomStatus === 'archived' && (
                  <button
                    onClick={handleReopenRoom}
                    disabled={isOperating}
                    className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-green-50 border border-green-200 text-green-700 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <RotateCcw className="w-4 h-4" />
                    重新开启（恢复可发送）
                  </button>
                )}

                {isOwner && (
                  <button
                    onClick={handleDeleteRoom}
                    disabled={isOperating}
                    className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-red-50 border border-red-200 text-red-700 inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    丢弃（永久关闭）
                  </button>
                )}
              </div>

              {actionError && <div className="text-xs text-red-600">{actionError}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
