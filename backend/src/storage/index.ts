import { appConfig } from '../config.js';
import { MemoryStorage } from './memory.js';
import { R2Storage } from './r2.js';
import type { StorageProvider } from './types.js';

export let storage: StorageProvider;

if (appConfig.storage === 'r2') {
  storage = new R2Storage();
  console.log('[storage] Using R2Storage');
} else {
  storage = new MemoryStorage();
  console.log('[storage] Using MemoryStorage');
}

export * from './types.js';
export { MemoryStorage } from './memory.js';
export { R2Storage } from './r2.js';
