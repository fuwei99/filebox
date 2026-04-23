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

export interface User {
  id: string;
  username: string;
  nickname: string;
  avatarCode: string | null;
  avatarEmoji: string | null;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  nickname?: string;
  password: string;
  avatarEmoji?: string;
}

export const register = async (data: RegisterData) => {
  const response = await api.post('/auth/register', data);
  return response.data;
};

export const login = async (data: LoginData) => {
  const response = await api.post('/auth/login', data);
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const updateProfile = async (data: { nickname?: string }) => {
  const response = await api.patch('/auth/profile', data);
  return response.data;
};

export const updateAvatar = async (data: { avatarCode?: string; avatarEmoji?: string }) => {
  const response = await api.patch('/auth/avatar', data);
  return response.data;
};
