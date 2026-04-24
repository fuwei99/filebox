import type { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config.js';
import type { ChatStorage } from '../storage/chat.js';
import type { UserStorage } from '../storage/user.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  nickname?: string;
  avatarEmoji?: string;
  isGuest?: boolean;
}

export const registerChatSocket = (
  io: SocketIOServer,
  chatStorage: ChatStorage,
  userStorage: UserStorage
): void => {
  // Authentication middleware for Socket.io
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, appConfig.jwtSecret) as { 
        id: string; 
        username: string;
        isGuest?: boolean;
        nickname?: string;
        avatarEmoji?: string;
      };
      socket.userId = decoded.id;
      socket.username = decoded.username;
      socket.isGuest = decoded.isGuest;
      socket.nickname = decoded.nickname;
      socket.avatarEmoji = decoded.avatarEmoji;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[socket] User connected: ${socket.username} (${socket.id})`);

    // Get user info (supports both regular users and guests)
    const getUserInfo = async () => {
      // For guest users, use info stored in socket from token
      if (socket.isGuest) {
        return {
          id: socket.userId!,
          username: socket.username!,
          nickname: socket.nickname || socket.username!,
          avatarCode: null,
          avatarEmoji: socket.avatarEmoji || '👤',
        };
      }
      // For regular users, fetch from storage
      const user = await userStorage.findById(socket.userId!);
      return {
        id: socket.userId!,
        username: socket.username!,
        nickname: user?.nickname || socket.username!,
        avatarCode: user?.avatarCode,
        avatarEmoji: user?.avatarEmoji,
      };
    };

    // Join room
    socket.on('join-room', async ({ roomCode }: { roomCode: string }) => {
      try {
        const room = await chatStorage.findRoomByCode(roomCode);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const isMember = await chatStorage.isMember(room.id, socket.userId!);
        if (!isMember) {
          socket.emit('error', { message: 'Not a member of this room' });
          return;
        }

        socket.join(room.id);
        await chatStorage.updateMemberOnlineStatus(room.id, socket.userId!, true);

        const userInfo = await getUserInfo();
        socket.to(room.id).emit('user-joined', {
          userId: socket.userId,
          ...userInfo,
        });

        socket.emit('joined-room', { roomId: room.id, code: room.code });
      } catch (error) {
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave room
    socket.on('leave-room', async ({ roomCode }: { roomCode: string }) => {
      try {
        const room = await chatStorage.findRoomByCode(roomCode);
        if (!room) return;

        socket.leave(room.id);
        await chatStorage.updateMemberOnlineStatus(room.id, socket.userId!, false);

        socket.to(room.id).emit('user-left', {
          userId: socket.userId,
          username: socket.username,
        });
      } catch (error) {
        console.error('Leave room error:', error);
      }
    });

    // Send message
    socket.on(
      'send-message',
      async ({
        roomCode,
        type,
        content,
        fileName,
        fileSize,
      }: {
        roomCode: string;
        type: 'text' | 'image' | 'file';
        content: string;
        fileName?: string;
        fileSize?: number;
      }) => {
        try {
          const room = await chatStorage.findRoomByCode(roomCode);
          if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
          }

          if (room.status !== 'active') {
            socket.emit('error', { message: 'Room is read-only' });
            return;
          }

          const isMember = await chatStorage.isMember(room.id, socket.userId!);
          if (!isMember) {
            socket.emit('error', { message: 'Not a member of this room' });
            return;
          }

          const message = await chatStorage.createMessage(
            room.id,
            socket.userId!,
            type,
            content,
            fileName,
            fileSize
          );

          const userInfo = await getUserInfo();

          const messageData = {
            id: message.id,
            type: message.type,
            content: message.content,
            fileName: message.fileName,
            fileSize: message.fileSize,
            timestamp: message.timestamp,
            sender: userInfo,
          };

          // Broadcast to all room members including sender
          io.to(room.id).emit('receive-message', messageData);
        } catch (error) {
          socket.emit('error', { message: 'Failed to send message' });
        }
      }
    );

    // Typing indicator
    socket.on('typing', async ({ roomCode }: { roomCode: string }) => {
      try {
        const room = await chatStorage.findRoomByCode(roomCode);
        if (!room) return;

        const userInfo = await getUserInfo();
        socket.to(room.id).emit('user-typing', {
          userId: socket.userId,
          ...userInfo,
        });
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // Read receipt
    socket.on('read-messages', async ({ roomCode }: { roomCode: string }) => {
      try {
        const room = await chatStorage.findRoomByCode(roomCode);
        if (!room) return;

        await chatStorage.updateLastRead(room.id, socket.userId!);
        
        socket.to(room.id).emit('read-receipt', {
          userId: socket.userId,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Read receipt error:', error);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`[socket] User disconnected: ${socket.username} (${socket.id})`);
      
      // Mark user offline in all rooms they joined
      try {
        const rooms = await chatStorage.getRoomsByUser(socket.userId!);
        for (const room of rooms) {
          await chatStorage.updateMemberOnlineStatus(room.id, socket.userId!, false);
          socket.to(room.id).emit('user-left', {
            userId: socket.userId,
            username: socket.username,
          });
        }
      } catch (error) {
        console.error('Disconnect cleanup error:', error);
      }
    });
  });
};
