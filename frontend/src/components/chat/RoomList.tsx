import { MessageSquare, LogOut, Users, Lock } from 'lucide-react';
import type { Room } from '../../api/chat';

interface RoomListProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelect: (room: Room) => void;
  onLeave: (roomCode: string) => void;
  isLoading: boolean;
}

export const RoomList: React.FC<RoomListProps> = ({
  rooms,
  selectedRoom,
  onSelect,
  onLeave,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-gray-400">
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-gray-400 text-center">
        <p className="text-sm">暂无房间<br />创建或加入一个开始聊天</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {rooms.map((room) => (
        <div
          key={room.id}
          onClick={() => onSelect(room)}
          className={`p-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors ${
            selectedRoom?.id === room.id ? 'bg-primary-50' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <h5 className="font-medium text-sm truncate">{room.name}</h5>
                {room.hasPassword && (
                  <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <Users className="w-3 h-3" />
                <span>{room.memberCount}/{room.maxMembers}</span>
                {room.unreadCount > 0 && (
                  <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-xs">
                    {room.unreadCount}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLeave(room.code);
              }}
              className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500 transition-colors"
              title="离开房间"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
