// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Higher-Order Function to protect API routes with JWT Authentication
 * @param {Function} handler - The API route handler function
 */
function withAuth(handler) {
  return async (req, res) => {
    // Check cookie (admin_token or token) or Authorization header
    const token = req.cookies?.admin_token || req.cookies?.token || req.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Access denied. No token provided.' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'technova-super-secure-jwt-key-2026-N3x0r@');
      req.user = decoded;
      req.admin = decoded;
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid token', message: 'Invalid or expired session token.' });
    }
  };
}

module.exports = {
  withAuth
};
