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

type ExpireUnit = 'hour' | 'day';

export interface UploadOptionPayload {
  expireHours?: number;
  expireValue?: number;
  expireUnit?: ExpireUnit;
  password?: string;
  maxDownloads?: number;
  scope?: 'file' | 'chat';
}

interface PreparedUploadItem {
  uploadToken: string;
  code: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  filename: string;
  size: number;
  mimeType: string;
  expireAt: string | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  imageUrl: string | null;
}

interface PrepareSingleResponse extends PreparedUploadItem {
  success: boolean;
}

interface PrepareBatchResponse {
  success: boolean;
  files: PreparedUploadItem[];
}

interface CompleteBatchResponse {
  success: boolean;
  files: {
    success: true;
    uploadToken: string;
    code: string;
    filename: string;
    size: number;
    mimeType: string;
    imageUrl: string | null;
  }[];
  errors: {
    success: false;
    uploadToken: string;
    error: string;
  }[];
  hasPassword: boolean;
}

const buildExpirePayload = (options?: UploadOptionPayload): Record<string, number | string> => {
  if (!options) return {};

  if (typeof options.expireValue === 'number') {
    return {
      expireValue: options.expireValue,
      expireUnit: options.expireUnit === 'day' ? 'day' : 'hour',
    };
  }

  if (typeof options.expireHours === 'number') {
    return { expireHours: options.expireHours };
  }

  return {};
};

const uploadToPresignedUrl = (
  file: File,
  prepared: Pick<PreparedUploadItem, 'uploadUrl' | 'method' | 'headers'>,
  onProgress?: UploadProgressCallback
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(prepared.method, prepared.uploadUrl);

    Object.entries(prepared.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.(0);
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress?.(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`R2 upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('R2 upload failed due to network error'));
    xhr.onabort = () => reject(new Error('R2 upload aborted'));
    xhr.send(file);
  });
};

export const uploadFile = async (
  file: File,
  options?: UploadOptionPayload,
  onProgress?: UploadProgressCallback
): Promise<UploadResponse> => {
  console.log(
    `[upload-client] single start name="${file.name}" size=${file.size} type=${file.type || 'unknown'} endpoint=/api/upload`
  );

  const payload: Record<string, unknown> = {
    filename: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    ...buildExpirePayload(options),
  };
  if (options?.password) payload.password = options.password;
  if (typeof options?.maxDownloads === 'number') payload.maxDownloads = options.maxDownloads;
  if (options?.scope) payload.scope = options.scope;

  try {
    const prepareResponse = await api.post<PrepareSingleResponse>('/upload/prepare', payload);
    await uploadToPresignedUrl(file, prepareResponse.data, onProgress);

    const response = await api.post<UploadResponse>('/upload/complete', {
      uploadToken: prepareResponse.data.uploadToken,
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
  options?: UploadOptionPayload,
  onProgress?: UploadProgressCallback
): Promise<BatchUploadResponse> => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(
    `[upload-client] batch start count=${files.length} totalBytes=${totalBytes} endpoint=/api/upload/batch`
  );

  const payload: Record<string, unknown> = {
    files: files.map((file) => ({
      filename: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    })),
    ...buildExpirePayload(options),
  };
  if (options?.password) payload.password = options.password;
  if (typeof options?.maxDownloads === 'number') payload.maxDownloads = options.maxDownloads;
  if (options?.scope) payload.scope = options.scope;

  try {
    const prepareResponse = await api.post<PrepareBatchResponse>('/upload/prepare-batch', payload);
    const preparedItems = prepareResponse.data.files;

    let uploadedBytes = 0;
    for (let i = 0; i < preparedItems.length; i += 1) {
      const prepared = preparedItems[i];
      const file = files[i];
      await uploadToPresignedUrl(file, prepared, (fileProgress) => {
        if (totalBytes <= 0) {
          onProgress?.(0);
          return;
        }
        const fileLoaded = (file.size * fileProgress) / 100;
        const overall = Math.round(((uploadedBytes + fileLoaded) * 100) / totalBytes);
        onProgress?.(overall);
      });
      uploadedBytes += file.size;
    }

    const response = await api.post<CompleteBatchResponse>('/upload/complete-batch', {
      uploadTokens: preparedItems.map((item) => item.uploadToken),
    });

    if (response.data.errors.length > 0) {
      throw new Error(response.data.errors[0].error || 'Batch upload completion failed');
    }

    console.log(
      `[upload-client] batch success status=${response.status} count=${files.length} totalBytes=${totalBytes}`
    );
    return {
      success: true,
      files: response.data.files.map((fileResult) => ({
        code: fileResult.code,
        filename: fileResult.filename,
        size: fileResult.size,
        mimeType: fileResult.mimeType,
        imageUrl: fileResult.imageUrl,
      })),
      expireAt: null,
      hasPassword: response.data.hasPassword,
    };
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
