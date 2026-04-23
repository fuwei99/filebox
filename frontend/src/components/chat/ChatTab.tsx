import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthForm } from './AuthForm';
import { RoomList } from './RoomList';
import { ChatRoom } from './ChatRoom';
import { CreateRoomModal } from './CreateRoomModal';
import { JoinRoomModal } from './JoinRoomModal';
import * as chatApi from '../../api/chat';
import type { Room } from '../../api/chat';

export const ChatTab: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAutoJoinedFromQuery, setHasAutoJoinedFromQuery] = useState(false);
  const socketRef = useRef<any>(null);

  // Load rooms when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadRooms();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || hasAutoJoinedFromQuery) return;

    const autoJoinFromQuery = async () => {
      const roomCode = new URLSearchParams(window.location.search).get('room');
      if (!roomCode) {
        setHasAutoJoinedFromQuery(true);
        return;
      }

      const normalizedCode = roomCode.trim().toLowerCase();

      try {
        const existing = rooms.find((room) => room.code === normalizedCode);
        if (existing) {
          setSelectedRoom(existing);
        } else {
          await chatApi.joinRoom(normalizedCode);
          const response = await chatApi.getRoom(normalizedCode);
          if (response.success) {
            const joinedRoom = response.room as Room;
            setRooms((prev) => {
              const exists = prev.some((item) => item.id === joinedRoom.id);
              return exists ? prev : [joinedRoom, ...prev];
            });
            setSelectedRoom(joinedRoom);
          }
        }
      } catch (error) {
        console.error('Failed to auto join room from query:', error);
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        setHasAutoJoinedFromQuery(true);
      }
    };

    void autoJoinFromQuery();
  }, [isAuthenticated, hasAutoJoinedFromQuery, rooms]);

  const loadRooms = async () => {
    try {
      setIsLoading(true);
      const response = await chatApi.getMyRooms();
      if (response.success) {
        setRooms(response.rooms);
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoomUpdated = (updatedRoom: Room) => {
    setRooms((prev) => prev.map((room) => (room.id === updatedRoom.id ? { ...room, ...updatedRoom } : room)));
    setSelectedRoom((prev) => (prev && prev.id === updatedRoom.id ? { ...prev, ...updatedRoom } : prev));
  };

  const handleRoomDeleted = (roomCode: string) => {
    setRooms((prev) => prev.filter((room) => room.code !== roomCode));
    setSelectedRoom((prev) => (prev?.code === roomCode ? null : prev));
  };

  const handleRoomCreated = (room: Room) => {
    setRooms((prev) => [room, ...prev]);
    setSelectedRoom(room);
    setIsCreateModalOpen(false);
  };

  const handleRoomJoined = (room: Room) => {
    // Check if already in list
    const exists = rooms.find((r) => r.id === room.id);
    if (!exists) {
      setRooms((prev) => [room, ...prev]);
    }
    setSelectedRoom(room);
    setIsJoinModalOpen(false);
  };

  const handleLeaveRoom = async (roomCode: string) => {
    try {
      await chatApi.leaveRoom(roomCode);
      setRooms((prev) => prev.filter((r) => r.code !== roomCode));
      if (selectedRoom?.code === roomCode) {
        setSelectedRoom(null);
      }
    } catch (error) {
      console.error('Failed to leave room:', error);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="card max-w-xl mx-auto">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] min-h-[680px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-lg">
              {user?.avatarEmoji || '👤'}
            </span>
          </div>
          <div>
            <h3 className="font-medium">{user?.nickname || user?.username}</h3>
            <p className="text-sm text-gray-500">在线</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="btn-secondary text-sm"
          >
            加入房间
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn-primary text-sm"
          >
            创建房间
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Room list sidebar */}
        <div className="w-80 flex-shrink-0 card overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <h4 className="font-medium text-sm">聊天房间</h4>
          </div>
          <RoomList
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelect={setSelectedRoom}
            onLeave={handleLeaveRoom}
            isLoading={isLoading}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 card overflow-hidden">
          {selectedRoom ? (
            <ChatRoom
              room={selectedRoom}
              onBack={() => setSelectedRoom(null)}
              socketRef={socketRef}
              onRoomUpdated={handleRoomUpdated}
              onRoomDeleted={handleRoomDeleted}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="mb-2">选择一个房间开始聊天</p>
                <p className="text-sm">或创建新房间邀请好友</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateRoomModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleRoomCreated}
        />
      )}
      {isJoinModalOpen && (
        <JoinRoomModal
          onClose={() => setIsJoinModalOpen(false)}
          onJoined={handleRoomJoined}
        />
      )}
    </div>
  );
};
