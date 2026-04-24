import express from 'express';
import { chatStorage } from '../storage/chat.js';
import { userStorage } from '../storage/user.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { storage } from '../storage/index.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Create room
router.post('/rooms', async (req: AuthRequest, res) => {
  try {
    const { name, maxMembers = 50, password, expireHours } = req.body;
    const userId = req.user!.id;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const room = await chatStorage.createRoom(
      userId,
      name.trim(),
      maxMembers,
      password || null,
      expireHours || null
    );

    res.json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        maxMembers: room.maxMembers,
        hasPassword: !!room.password,
        creatorId: room.creatorId,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Helper to get user display info (supports both regular and guest users)
const getUserDisplayInfo = async (userId: string, reqUser: AuthRequest['user']) => {
  if (reqUser?.isGuest) {
    return {
      nickname: reqUser.nickname || 'Guest',
      avatarCode: null,
      avatarEmoji: reqUser.avatarEmoji || '👤',
    };
  }
  const user = await userStorage.findById(userId);
  return {
    nickname: user?.nickname || 'Unknown',
    avatarCode: user?.avatarCode || null,
    avatarEmoji: user?.avatarEmoji || '👤',
  };
};

// Get my rooms
router.get('/rooms', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const rooms = await chatStorage.getRoomsByUser(userId);

    const roomsWithInfo = await Promise.all(
      rooms.map(async (room) => {
        const members = await chatStorage.getRoomMembers(room.id);
        const unreadCount = 0; // Will calculate based on lastRead

        return {
          id: room.id,
          code: room.code,
          name: room.name,
          maxMembers: room.maxMembers,
          hasPassword: !!room.password,
          status: room.status,
          creatorId: room.creatorId,
          memberCount: members.length,
          unreadCount,
          createdAt: room.createdAt,
        };
      })
    );

    res.json({
      success: true,
      rooms: roomsWithInfo,
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// Get room details
router.get('/rooms/:code', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.user!.id;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const isMember = await chatStorage.isMember(room.id, userId);
    if (!isMember && room.status !== 'active') {
      return res.status(403).json({ error: 'Room is not accessible' });
    }

    const members = await chatStorage.getRoomMembers(room.id);
    const membersWithInfo = await Promise.all(
      members.map(async (member) => {
        // For the requesting user, use info from token (supports guests)
        if (member.userId === req.user!.id) {
          return {
            userId: member.userId,
            nickname: req.user!.nickname || req.user!.username,
            avatarCode: null,
            avatarEmoji: req.user!.avatarEmoji || '👤',
            isOnline: member.isOnline,
            joinedAt: member.joinedAt,
          };
        }
        const user = await userStorage.findById(member.userId);
        return {
          userId: member.userId,
          nickname: user?.nickname || 'Unknown',
          avatarCode: user?.avatarCode,
          avatarEmoji: user?.avatarEmoji,
          isOnline: member.isOnline,
          joinedAt: member.joinedAt,
        };
      })
    );

    res.json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        maxMembers: room.maxMembers,
        hasPassword: !!room.password,
        status: room.status,
        creatorId: room.creatorId,
        isMember,
        members: membersWithInfo,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// Join room
router.post('/rooms/:code/join', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const { password } = req.body;
    const userId = req.user!.id;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const isAlreadyMember = await chatStorage.isMember(room.id, userId);
    if (isAlreadyMember) {
      return res.json({ success: true, message: 'Already a member' });
    }

    await chatStorage.joinRoom(room.id, userId, password);

    res.json({ success: true, message: 'Joined successfully' });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid password') {
        return res.status(403).json({ error: 'Invalid password' });
      }
      if (error.message === 'Room is full') {
        return res.status(403).json({ error: 'Room is full' });
      }
      if (error.message === 'Room is deleted') {
        return res.status(403).json({ error: 'Room is deleted' });
      }
    }
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Leave room
router.post('/rooms/:code/leave', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.user!.id;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await chatStorage.leaveRoom(room.id, userId);

    res.json({ success: true, message: 'Left successfully' });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Get messages
router.get('/rooms/:code/messages', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const isMember = await chatStorage.isMember(room.id, userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const messages = await chatStorage.getMessages(room.id, limit, before);

    const messagesWithSender = await Promise.all(
      messages.map(async (msg) => {
        // For the requesting user, use info from token (supports guests)
        if (msg.senderId === req.user!.id) {
          return {
            id: msg.id,
            type: msg.type,
            content: msg.content,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            timestamp: msg.timestamp,
            sender: {
              id: msg.senderId,
              nickname: req.user!.nickname || req.user!.username,
              avatarCode: null,
              avatarEmoji: req.user!.avatarEmoji || '👤',
            },
          };
        }
        const sender = await userStorage.findById(msg.senderId);
        return {
          id: msg.id,
          type: msg.type,
          content: msg.content,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          timestamp: msg.timestamp,
          sender: {
            id: msg.senderId,
            nickname: sender?.nickname || 'Unknown',
            avatarCode: sender?.avatarCode,
            avatarEmoji: sender?.avatarEmoji,
          },
        };
      })
    );

    // Update last read
    await chatStorage.updateLastRead(room.id, userId);

    res.json({
      success: true,
      messages: messagesWithSender,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send message (HTTP fallback - main transport is Socket.io)
router.post('/rooms/:code/messages', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const { type, content, fileName, fileSize } = req.body;
    const userId = req.user!.id;

    if (!type || !content) {
      return res.status(400).json({ error: 'Type and content are required' });
    }

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const isMember = await chatStorage.isMember(room.id, userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const message = await chatStorage.createMessage(
      room.id,
      userId,
      type,
      content,
      fileName,
      fileSize
    );

    // For guest users, use token info directly
    const senderInfo = req.user!.isGuest
      ? {
          id: userId,
          nickname: req.user!.nickname || req.user!.username,
          avatarCode: null,
          avatarEmoji: req.user!.avatarEmoji || '👤',
        }
      : await (async () => {
          const sender = await userStorage.findById(userId);
          return {
            id: userId,
            nickname: sender?.nickname || 'Unknown',
            avatarCode: sender?.avatarCode,
            avatarEmoji: sender?.avatarEmoji,
          };
        })();

    res.json({
      success: true,
      message: {
        id: message.id,
        type: message.type,
        content: message.content,
        fileName: message.fileName,
        fileSize: message.fileSize,
        timestamp: message.timestamp,
        sender: senderInfo,
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// End room (creator only)
router.post('/rooms/:code/end', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const { archive = true } = req.body;
    const userId = req.user!.id;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.creatorId !== userId) {
      return res.status(403).json({ error: 'Only creator can end room' });
    }

    await chatStorage.endRoom(room.id, userId, archive);

    // 非归档（删除）时清理 R2 聊天附件
    if (!archive && storage.deleteByPrefix) {
      await storage.deleteByPrefix(`chat/${room.id}/`);
    }

    res.json({
      success: true,
      message: archive ? 'Room archived' : 'Room deleted',
    });
  } catch (error) {
    console.error('End room error:', error);
    res.status(500).json({ error: 'Failed to end room' });
  }
});

// Reopen room (creator only)
router.post('/rooms/:code/reopen', async (req: AuthRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.user!.id;

    const room = await chatStorage.findRoomByCode(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.creatorId !== userId) {
      return res.status(403).json({ error: 'Only creator can reopen room' });
    }

    await chatStorage.reopenRoom(room.id, userId);

    res.json({
      success: true,
      message: 'Room reopened',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Deleted room cannot be reopened') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Reopen room error:', error);
    res.status(500).json({ error: 'Failed to reopen room' });
  }
});

export default router;
