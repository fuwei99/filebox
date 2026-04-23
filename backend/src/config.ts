import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  port: number;
  url: string;
  maxFileSize: number;
  maxBatchSize: number;
  defaultExpire: number;
  storage: 'memory' | 'r2';
  jwtSecret: string;
  gitSync: {
    enabled: boolean;
    owner: string;
    repo: string;
    branch: string;
    token: string;
    intervalMinutes: number;
    dir?: string;
    snapshotFile: string;
    chunkSizeMB: number;
  };
  r2: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
}

const defaultConfig: AppConfig = {
  port: 7860,
  url: 'http://localhost:7860',
  maxFileSize: 100 * 1024 * 1024,
  maxBatchSize: 10,
  defaultExpire: 24,
  storage: 'memory',
  jwtSecret: process.env.JWT_SECRET || 'filebox-default-secret-change-in-production',
  gitSync: {
    enabled: false,
    owner: '',
    repo: '',
    branch: 'main',
    token: '',
    intervalMinutes: 10,
    snapshotFile: 'snapshot.json',
    chunkSizeMB: 32,
  },
  r2: {
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
  },
};

const resolveFirstExistingPath = (candidates: string[]): string | null => {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const parseConfigFromEnvFile = (envText: string): AppConfig | null => {
  const match = envText.match(/(?:^|\n)CONFIG=(.*)(?:\n|$)/);
  if (!match) return null;

  const raw = match[1].trim();
  const unquoted =
    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
      ? raw.slice(1, -1)
      : raw;

  try {
    return JSON.parse(unquoted) as AppConfig;
  } catch {
    return null;
  }
};

const mergeConfig = (rawConfig: Partial<AppConfig>): AppConfig => {
  return {
    ...defaultConfig,
    ...rawConfig,
    gitSync: {
      ...defaultConfig.gitSync,
      ...(rawConfig.gitSync ?? {}),
    },
    r2: {
      ...defaultConfig.r2,
      ...(rawConfig.r2 ?? {}),
    },
  };
};

const loadAppConfig = (): AppConfig => {
  const configPath = resolveFirstExistingPath([
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(process.cwd(), '../config.json'),
  ]);

  if (configPath) {
    const configText = fs.readFileSync(configPath, 'utf-8');
    return mergeConfig(JSON.parse(configText) as Partial<AppConfig>);
  }

  const envPath = resolveFirstExistingPath([
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ]);

  if (envPath) {
    const envText = fs.readFileSync(envPath, 'utf-8');
    const envConfig = parseConfigFromEnvFile(envText);
    if (envConfig) {
      return mergeConfig(envConfig);
    }
  }

  return defaultConfig;
};

export const appConfig = loadAppConfig();
