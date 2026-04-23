import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const getServerAuthStatus = async (): Promise<{ enabled: boolean }> => {
  const response = await api.get('/auth/server-status');
  return response.data;
};

export const serverLogin = async (password: string): Promise<{ success: boolean; token?: string; error?: string }> => {
  const response = await api.post('/auth/server-login', { password });
  return response.data;
};
