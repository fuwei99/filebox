import { v4 as uuidv4 } from 'uuid';
import { generateCode } from '../utils/code.js';

export interface Room {
  id: string;
  code: string;
  creatorId: string;
  name: string;
  maxMembers: number;
  password: string | null;
  expireAt: Date | null;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt: Date;
  isOnline: boolean;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
  content: string;
  fileName?: string;
  fileSize?: number;
  timestamp: Date;
}

export interface ChatSnapshot {
  rooms: RoomSnapshotRecord[];
  members: RoomMemberSnapshotRecord[];
  messages: MessageSnapshotRecord[];
}

export interface RoomSnapshotRecord {
  id: string;
  code: string;
  creatorId: string;
  name: string;
  maxMembers: number;
  password: string | null;
  expireAt: string | null;
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
}

export interface RoomMemberSnapshotRecord {
  roomId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string;
  isOnline: boolean;
}

export interface MessageSnapshotRecord {
  id: string;
  roomId: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
  content: string;
  fileName?: string;
  fileSize?: number;
  timestamp: string;
}

export interface ChatStorageProvider {
  createRoom(creatorId: string, name: string, maxMembers: number, password?: string | null, expireHours?: number | null): Promise<Room>;
  findRoomByCode(code: string): Promise<Room | null>;
  findRoomById(id: string): Promise<Room | null>;
  getRoomsByUser(userId: string): Promise<Room[]>;
  joinRoom(roomId: string, userId: string, password?: string): Promise<void>;
  leaveRoom(roomId: string, userId: string): Promise<void>;
  addMember(roomId: string, userId: string): Promise<void>;
  removeMember(roomId: string, userId: string): Promise<void>;
  isMember(roomId: string, userId: string): Promise<boolean>;
  getRoomMembers(roomId: string): Promise<RoomMember[]>;
  updateMemberOnlineStatus(roomId: string, userId: string, isOnline: boolean): Promise<void>;
  updateLastRead(roomId: string, userId: string): Promise<void>;
  createMessage(roomId: string, senderId: string, type: 'text' | 'image' | 'file', content: string, fileName?: string, fileSize?: number): Promise<Message>;
  getMessages(roomId: string, limit?: number, before?: Date): Promise<Message[]>;
  endRoom(roomId: string, userId: string, archive: boolean): Promise<void>;
  reopenRoom(roomId: string, userId: string): Promise<void>;
  cleanupExpired(): Promise<void>;
  exportSnapshot(): ChatSnapshot;
  importSnapshot(snapshot: ChatSnapshot): void;
}

export class ChatStorage implements ChatStorageProvider {
  private rooms = new Map<string, Room>();
  private roomCodeIndex = new Map<string, string>(); // code -> roomId
  private members = new Map<string, RoomMember>(); // composite key: roomId:userId
  private messages = new Map<string, Message>(); // roomId:messageId
  private roomMessages = new Map<string, string[]>(); // roomId -> messageIds[]

  async createRoom(
    creatorId: string,
    name: string,
    maxMembers: number,
    password: string | null = null,
    expireHours: number | null = null
  ): Promise<Room> {
    const code = generateCode();
    const room: Room = {
      id: uuidv4(),
      code: code.toLowerCase(),
      creatorId,
      name: name.trim() || '未命名房间',
      maxMembers: Math.min(Math.max(2, maxMembers), 100),
      password,
      expireAt: expireHours ? new Date(Date.now() + expireHours * 60 * 60 * 1000) : null,
      status: 'active',
      createdAt: new Date(),
    };

    this.rooms.set(room.id, room);
    this.roomCodeIndex.set(room.code, room.id);

    // Creator auto joins
    await this.addMember(room.id, creatorId);

    return room;
  }

  async findRoomByCode(code: string): Promise<Room | null> {
    const normalizedCode = code.trim().toLowerCase();
    const roomId = this.roomCodeIndex.get(normalizedCode);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  async findRoomById(id: string): Promise<Room | null> {
    return this.rooms.get(id) || null;
  }

  async getRoomsByUser(userId: string): Promise<Room[]> {
    const roomIds = new Set<string>();
    for (const [key, member] of this.members) {
      if (member.userId === userId) {
        roomIds.add(member.roomId);
      }
    }
    return Array.from(roomIds).map(id => this.rooms.get(id)).filter((r): r is Room => !!r);
  }

  async joinRoom(roomId: string, userId: string, password?: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'deleted') throw new Error('Room is deleted');
    if (room.password && room.password !== password) throw new Error('Invalid password');

    await this.addMember(roomId, userId);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.removeMember(roomId, userId);
  }

  async addMember(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const currentMembers = await this.getRoomMembers(roomId);
    if (currentMembers.length >= room.maxMembers) {
      throw new Error('Room is full');
    }

    const key = `${roomId}:${userId}`;
    if (!this.members.has(key)) {
      const now = new Date();
      this.members.set(key, {
        roomId,
        userId,
        joinedAt: now,
        lastReadAt: now,
        isOnline: false,
      });
    }
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}:${userId}`;
    this.members.delete(key);
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const key = `${roomId}:${userId}`;
    return this.members.has(key);
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const members: RoomMember[] = [];
    for (const [key, member] of this.members) {
      if (member.roomId === roomId) {
        members.push(member);
      }
    }
    return members;
  }

  async updateMemberOnlineStatus(roomId: string, userId: string, isOnline: boolean): Promise<void> {
    const key = `${roomId}:${userId}`;
    const member = this.members.get(key);
    if (member) {
      member.isOnline = isOnline;
    }
  }

  async updateLastRead(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}:${userId}`;
    const member = this.members.get(key);
    if (member) {
      member.lastReadAt = new Date();
    }
  }

  async createMessage(
    roomId: string,
    senderId: string,
    type: 'text' | 'image' | 'file',
    content: string,
    fileName?: string,
    fileSize?: number
  ): Promise<Message> {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'active') {
      throw new Error('Room not found or not active');
    }

    const message: Message = {
      id: uuidv4(),
      roomId,
      senderId,
      type,
      content,
      fileName,
      fileSize,
      timestamp: new Date(),
    };

    this.messages.set(`${roomId}:${message.id}`, message);

    const roomMessageList = this.roomMessages.get(roomId) || [];
    roomMessageList.push(message.id);
    this.roomMessages.set(roomId, roomMessageList);

    return message;
  }

  async getMessages(roomId: string, limit: number = 50, before?: Date): Promise<Message[]> {
    const messageIds = this.roomMessages.get(roomId) || [];
    const messages: Message[] = [];

    for (let i = messageIds.length - 1; i >= 0; i--) {
      const message = this.messages.get(`${roomId}:${messageIds[i]}`);
      if (message) {
        if (before && message.timestamp >= before) continue;
        messages.unshift(message);
        if (messages.length >= limit) break;
      }
    }

    return messages;
  }

  async endRoom(roomId: string, userId: string, archive: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.creatorId !== userId) throw new Error('Only creator can end room');

    room.status = archive ? 'archived' : 'deleted';
  }

  async reopenRoom(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.creatorId !== userId) throw new Error('Only creator can reopen room');
    if (room.status === 'deleted') throw new Error('Deleted room cannot be reopened');

    room.status = 'active';
  }

  async cleanupExpired(): Promise<void> {
    const now = new Date();
    for (const room of this.rooms.values()) {
      if (room.status === 'active' && room.expireAt && now > room.expireAt) {
        room.status = 'archived';
      }
    }
  }

  exportSnapshot(): ChatSnapshot {
    const rooms: RoomSnapshotRecord[] = [];
    const members: RoomMemberSnapshotRecord[] = [];
    const messages: MessageSnapshotRecord[] = [];

    for (const room of this.rooms.values()) {
      rooms.push({
        id: room.id,
        code: room.code,
        creatorId: room.creatorId,
        name: room.name,
        maxMembers: room.maxMembers,
        password: room.password,
        expireAt: room.expireAt?.toISOString() || null,
        status: room.status,
        createdAt: room.createdAt.toISOString(),
      });
    }

    for (const member of this.members.values()) {
      members.push({
        roomId: member.roomId,
        userId: member.userId,
        joinedAt: member.joinedAt.toISOString(),
        lastReadAt: member.lastReadAt.toISOString(),
        isOnline: member.isOnline,
      });
    }

    for (const message of this.messages.values()) {
      messages.push({
        id: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        type: message.type,
        content: message.content,
        fileName: message.fileName,
        fileSize: message.fileSize,
        timestamp: message.timestamp.toISOString(),
      });
    }

    return { rooms, members, messages };
  }

  importSnapshot(snapshot: ChatSnapshot): void {
    this.rooms.clear();
    this.roomCodeIndex.clear();
    this.members.clear();
    this.messages.clear();
    this.roomMessages.clear();

    for (const record of snapshot.rooms) {
      const room: Room = {
        id: record.id,
        code: record.code,
        creatorId: record.creatorId,
        name: record.name,
        maxMembers: record.maxMembers,
        password: record.password,
        expireAt: record.expireAt ? new Date(record.expireAt) : null,
        status: record.status,
        createdAt: new Date(record.createdAt),
      };
      this.rooms.set(room.id, room);
      this.roomCodeIndex.set(room.code, room.id);
    }

    for (const record of snapshot.members) {
      const member: RoomMember = {
        roomId: record.roomId,
        userId: record.userId,
        joinedAt: new Date(record.joinedAt),
        lastReadAt: new Date(record.lastReadAt),
        isOnline: false, // Reset online status on restore
      };
      this.members.set(`${member.roomId}:${member.userId}`, member);
    }

    for (const record of snapshot.messages) {
      const message: Message = {
        id: record.id,
        roomId: record.roomId,
        senderId: record.senderId,
        type: record.type,
        content: record.content,
        fileName: record.fileName,
        fileSize: record.fileSize,
        timestamp: new Date(record.timestamp),
      };
      this.messages.set(`${message.roomId}:${message.id}`, message);

      const roomMessageList = this.roomMessages.get(message.roomId) || [];
      roomMessageList.push(message.id);
      this.roomMessages.set(message.roomId, roomMessageList);
    }
  }
}

export const chatStorage = new ChatStorage();
