import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  username: string;
  nickname: string;
  passwordHash: string;
  avatarCode: string | null;
  avatarEmoji: string | null;
  createdAt: Date;
}

export interface UserSnapshotRecord {
  id: string;
  username: string;
  nickname: string;
  passwordHash: string;
  avatarCode: string | null;
  avatarEmoji: string | null;
  createdAt: string;
}

export interface UserStorageProvider {
  create(username: string, nickname: string, password: string, avatarCode?: string | null, avatarEmoji?: string | null): Promise<User>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateAvatar(userId: string, avatarCode: string | null, avatarEmoji: string | null): Promise<void>;
  updateNickname(userId: string, nickname: string): Promise<void>;
  validatePassword(user: User, password: string): Promise<boolean>;
  exportSnapshot(): UserSnapshotRecord[];
  importSnapshot(records: UserSnapshotRecord[]): void;
}

export class UserStorage implements UserStorageProvider {
  private storage = new Map<string, User>();
  private usernameIndex = new Map<string, string>(); // username -> userId

  async create(
    username: string,
    nickname: string,
    password: string,
    avatarCode: string | null = null,
    avatarEmoji: string | null = null
  ): Promise<User> {
    const normalizedUsername = username.trim().toLowerCase();
    
    if (this.usernameIndex.has(normalizedUsername)) {
      throw new Error('Username already exists');
    }

    const user: User = {
      id: uuidv4(),
      username: normalizedUsername,
      nickname: nickname.trim() || username,
      passwordHash: await bcrypt.hash(password, 10),
      avatarCode,
      avatarEmoji,
      createdAt: new Date(),
    };

    this.storage.set(user.id, user);
    this.usernameIndex.set(normalizedUsername, user.id);

    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalizedUsername = username.trim().toLowerCase();
    const userId = this.usernameIndex.get(normalizedUsername);
    if (!userId) return null;
    return this.storage.get(userId) || null;
  }

  async findById(id: string): Promise<User | null> {
    return this.storage.get(id) || null;
  }

  async updateAvatar(userId: string, avatarCode: string | null, avatarEmoji: string | null): Promise<void> {
    const user = this.storage.get(userId);
    if (!user) throw new Error('User not found');
    
    user.avatarCode = avatarCode;
    user.avatarEmoji = avatarEmoji;
  }

  async updateNickname(userId: string, nickname: string): Promise<void> {
    const user = this.storage.get(userId);
    if (!user) throw new Error('User not found');
    
    user.nickname = nickname.trim() || user.username;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  exportSnapshot(): UserSnapshotRecord[] {
    return Array.from(this.storage.values()).map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      passwordHash: user.passwordHash,
      avatarCode: user.avatarCode,
      avatarEmoji: user.avatarEmoji,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  importSnapshot(records: UserSnapshotRecord[]): void {
    this.storage.clear();
    this.usernameIndex.clear();

    for (const record of records) {
      const user: User = {
        id: record.id,
        username: record.username,
        nickname: record.nickname,
        passwordHash: record.passwordHash,
        avatarCode: record.avatarCode,
        avatarEmoji: record.avatarEmoji,
        createdAt: new Date(record.createdAt),
      };

      this.storage.set(user.id, user);
      this.usernameIndex.set(user.username, user.id);
    }
  }
}

export const userStorage = new UserStorage();
