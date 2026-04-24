import express from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config.js';
import { userStorage } from '../storage/user.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { generateCode } from '../utils/code.js';
import { storage } from '../storage/index.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, nickname, password, avatarEmoji } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await userStorage.create(
      username,
      nickname || username,
      password,
      null,
      avatarEmoji || null
    );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      appConfig.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarCode: user.avatarCode,
        avatarEmoji: user.avatarEmoji,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already exists') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await userStorage.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await userStorage.validatePassword(user, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      appConfig.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarCode: user.avatarCode,
        avatarEmoji: user.avatarEmoji,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await userStorage.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarCode: user.avatarCode,
        avatarEmoji: user.avatarEmoji,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Update profile
router.patch('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { nickname } = req.body;
    const userId = req.user!.id;

    if (nickname) {
      await userStorage.updateNickname(userId, nickname);
    }

    const user = await userStorage.findById(userId);
    res.json({
      success: true,
      user: {
        id: user!.id,
        username: user!.username,
        nickname: user!.nickname,
        avatarCode: user!.avatarCode,
        avatarEmoji: user!.avatarEmoji,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar (returns file code)
router.post('/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    // This will be handled by multer in the actual implementation
    // For now, return error indicating use /api/upload instead
    res.status(400).json({ 
      error: 'Please use /api/upload to upload avatar, then update profile with the returned code' 
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Update avatar with uploaded file code
router.patch('/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { avatarCode, avatarEmoji } = req.body;
    const userId = req.user!.id;

    await userStorage.updateAvatar(userId, avatarCode || null, avatarEmoji || null);

    const user = await userStorage.findById(userId);
    res.json({
      success: true,
      user: {
        id: user!.id,
        username: user!.username,
        nickname: user!.nickname,
        avatarCode: user!.avatarCode,
        avatarEmoji: user!.avatarEmoji,
      },
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Server auth status
router.get('/server-status', (req, res) => {
  res.json({ enabled: appConfig.serverAuth.enabled });
});

// Guest login - no registration required, just pick emoji and nickname
router.post('/guest-login', async (req, res) => {
  try {
    const { nickname, avatarEmoji } = req.body;

    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    if (nickname.trim().length > 20) {
      return res.status(400).json({ error: 'Nickname must be at most 20 characters' });
    }

    // Generate a unique guest ID based on timestamp and random
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const guestUsername = `guest_${Date.now()}`;

    const token = jwt.sign(
      { 
        id: guestId, 
        username: guestUsername,
        isGuest: true,
        nickname: nickname.trim(),
        avatarEmoji: avatarEmoji || '👤'
      },
      appConfig.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: guestId,
        username: guestUsername,
        nickname: nickname.trim(),
        avatarCode: null,
        avatarEmoji: avatarEmoji || '👤',
        isGuest: true,
      },
    });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ error: 'Guest login failed' });
  }
});

// Server login
router.post('/server-login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (password !== appConfig.serverAuth.password) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { type: 'server' },
    appConfig.jwtSecret,
    { expiresIn: '30d' }
  );

  res.json({ success: true, token });
});

export default router;
