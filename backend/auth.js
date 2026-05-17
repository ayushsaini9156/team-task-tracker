import jwt from 'jsonwebtoken';
import { findUserById } from './db.js';

const jwtSecret = process.env.JWT_SECRET || 'development-secret';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, jwtSecret, { expiresIn: '7d' });
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token.' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({ message: 'Invalid authorization token.' });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authorization token.' });
  }
}