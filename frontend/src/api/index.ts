import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('filebox_server_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('filebox_server_token');
      window.dispatchEvent(new CustomEvent('server-auth-expired'));
    }
    return Promise.reject(error);
  }
);

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

export interface ConfigResponse {
  maxFileSize: number;
  maxBatchSize: number;
}

type UploadProgressCallback = (progress: number) => void;

export const uploadFile = async (
  file: File,
  options?: { expireHours?: number; password?: string; maxDownloads?: number },
  onProgress?: UploadProgressCallback
): Promise<UploadResponse> => {
  console.log(
    `[upload-client] single start name="${file.name}" size=${file.size} type=${file.type || 'unknown'} endpoint=/api/upload`
  );

  const formData = new FormData();
  formData.append('file', file);
  if (options?.expireHours) formData.append('expireHours', String(options.expireHours));
  if (options?.password) formData.append('password', options.password);
  if (options?.maxDownloads) formData.append('maxDownloads', String(options.maxDownloads));

  try {
    const response = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = progressEvent.total
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
          : 0;
        onProgress?.(percentCompleted);
      },
    });
    console.log(
      `[upload-client] single success status=${response.status} name="${file.name}" size=${file.size}`
    );
    return response.data;
  } catch (error: any) {
    console.error(
      `[upload-client] single failed name="${file.name}" size=${file.size} status=${error?.response?.status || 'unknown'} contentType=${error?.response?.headers?.['content-type'] || 'unknown'}`,
      error?.response?.data
    );
    throw error;
  }
};

export const uploadBatch = async (
  files: File[],
  options?: { expireHours?: number; password?: string; maxDownloads?: number },
  onProgress?: UploadProgressCallback
): Promise<BatchUploadResponse> => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(
    `[upload-client] batch start count=${files.length} totalBytes=${totalBytes} endpoint=/api/upload/batch`
  );

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (options?.expireHours) formData.append('expireHours', String(options.expireHours));
  if (options?.password) formData.append('password', options.password);
  if (options?.maxDownloads) formData.append('maxDownloads', String(options.maxDownloads));

  try {
    const response = await api.post('/upload/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = progressEvent.total
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
          : 0;
        onProgress?.(percentCompleted);
      },
    });
    console.log(
      `[upload-client] batch success status=${response.status} count=${files.length} totalBytes=${totalBytes}`
    );
    return response.data;
  } catch (error: any) {
    console.error(
      `[upload-client] batch failed count=${files.length} totalBytes=${totalBytes} status=${error?.response?.status || 'unknown'} contentType=${error?.response?.headers?.['content-type'] || 'unknown'}`,
      error?.response?.data
    );
    throw error;
  }
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

export const getConfig = async (): Promise<ConfigResponse> => {
  const response = await api.get('/config');
  return response.data;
};
