import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export interface UploadResponse {
  success: boolean;
  code: string;
  filename: string;
  size: number;
  mimeType: string;
  expireAt: string | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  imageUrl: string | null;
}

export interface BatchUploadResponse {
  success: boolean;
  files: {
    code: string;
    filename: string;
    size: number;
    mimeType: string;
    imageUrl: string | null;
  }[];
  expireAt: string | null;
  hasPassword: boolean;
}

export interface FileInfo {
  success: boolean;
  filename: string;
  size: number;
  mimeType: string;
  uploadTime: string;
  expireAt: string | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  isImage: boolean;
}

export interface QRCodeResponse {
  success: boolean;
  qrcode: string;
}

type UploadProgressCallback = (progress: number) => void;

export const uploadFile = async (
  file: File,
  options?: { expireHours?: number; password?: string; maxDownloads?: number },
  onProgress?: UploadProgressCallback
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.expireHours) formData.append('expireHours', String(options.expireHours));
  if (options?.password) formData.append('password', options.password);
  if (options?.maxDownloads) formData.append('maxDownloads', String(options.maxDownloads));

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      onProgress?.(percentCompleted);
    },
  });
  return response.data;
};

export const uploadBatch = async (
  files: File[],
  options?: { expireHours?: number; password?: string; maxDownloads?: number },
  onProgress?: UploadProgressCallback
): Promise<BatchUploadResponse> => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (options?.expireHours) formData.append('expireHours', String(options.expireHours));
  if (options?.password) formData.append('password', options.password);
  if (options?.maxDownloads) formData.append('maxDownloads', String(options.maxDownloads));

  const response = await api.post('/upload/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      onProgress?.(percentCompleted);
    },
  });
  return response.data;
};

export const getFileInfo = async (code: string): Promise<FileInfo> => {
  const response = await api.get(`/download/info/${code}`);
  return response.data;
};

export const downloadFile = (code: string, password?: string): string => {
  return `/api/download/${code}${password ? `?password=${encodeURIComponent(password)}` : ''}`;
};

export const getQRCode = async (code: string): Promise<QRCodeResponse> => {
  const response = await api.get(`/download/qrcode/${code}`);
  return response.data;
};
