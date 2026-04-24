import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    isGuest?: boolean;
    nickname?: string;
    avatarEmoji?: string;
  };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, appConfig.jwtSecret) as { 
      id: string; 
      username: string;
      isGuest?: boolean;
      nickname?: string;
      avatarEmoji?: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, appConfig.jwtSecret) as { id: string; username: string };
      req.user = decoded;
    } catch {
      // Invalid token, continue without user
    }
  }
  
  next();
};

export const requireServerAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!appConfig.serverAuth.enabled) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Server authentication required' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, appConfig.jwtSecret) as { type: string };
    if (decoded.type !== 'server') {
      res.status(401).json({ error: 'Invalid server token' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
