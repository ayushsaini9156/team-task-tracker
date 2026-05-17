import jwt from 'jsonwebtoken';
import { findUserById } from './db.js';

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      name: user.name,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing authentication token.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'Authentication token is no longer valid.' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication token is invalid or expired.' });
  }
}
