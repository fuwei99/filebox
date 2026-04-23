import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('filebox_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Room {
  id: string;
  code: string;
  name: string;
  maxMembers: number;
  hasPassword: boolean;
  status: 'active' | 'archived' | 'deleted';
  creatorId: string;
  memberCount: number;
  unreadCount: number;
  createdAt: string;
}

export interface RoomDetail extends Room {
  isMember: boolean;
  members: RoomMemberInfo[];
}

export interface RoomMemberInfo {
  userId: string;
  nickname: string;
  avatarCode: string | null;
  avatarEmoji: string | null;
  isOnline: boolean;
  joinedAt: string;
}

export interface Message {
  id: string;
  type: 'text' | 'image' | 'file';
  content: string;
  fileName?: string;
  fileSize?: number;
  timestamp: string;
  sender: {
    id: string;
    nickname: string;
    avatarCode: string | null;
    avatarEmoji: string | null;
  };
}

export interface CreateRoomData {
  name: string;
  maxMembers?: number;
  password?: string;
  expireHours?: number | null;
}

export const createRoom = async (data: CreateRoomData) => {
  const response = await api.post('/chat/rooms', data);
  return response.data;
};

export const getMyRooms = async () => {
  const response = await api.get('/chat/rooms');
  return response.data;
};

export const getRoom = async (code: string) => {
  const response = await api.get(`/chat/rooms/${code}`);
  return response.data;
};

export const joinRoom = async (code: string, password?: string) => {
  const response = await api.post(`/chat/rooms/${code}/join`, { password });
  return response.data;
};

export const leaveRoom = async (code: string) => {
  const response = await api.post(`/chat/rooms/${code}/leave`);
  return response.data;
};

export const getMessages = async (code: string, limit?: number, before?: string) => {
  const response = await api.get(`/chat/rooms/${code}/messages`, {
    params: { limit, before },
  });
  return response.data;
};

export const sendMessage = async (
  code: string,
  type: 'text' | 'image' | 'file',
  content: string,
  fileName?: string,
  fileSize?: number
) => {
  const response = await api.post(`/chat/rooms/${code}/messages`, {
    type,
    content,
    fileName,
    fileSize,
  });
  return response.data;
};

export const endRoom = async (code: string, archive: boolean = true) => {
  const response = await api.post(`/chat/rooms/${code}/end`, { archive });
  return response.data;
};

export const reopenRoom = async (code: string) => {
  const response = await api.post(`/chat/rooms/${code}/reopen`);
  return response.data;
};
