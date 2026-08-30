// lib/auth.js
import jwt from 'jsonwebtoken';

export function withAuth(handler) {
  return async (req, res) => {
    const token = req.cookies?.admin_token || req.cookies?.token || req.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'technova-super-secure-jwt-key-2026-N3x0r@');
      req.user = decoded;
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  };
}
