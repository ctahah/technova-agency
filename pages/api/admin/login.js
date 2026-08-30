// pages/api/admin/login.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginLimiter } from '@/lib/rateLimit';

export default async function handler(req, res) {
  // Rate limit apply karo
  await loginLimiter(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  // Email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Database se user check karo
  const user = await db.users.findUnique({ where: { email } });
  
  if (!user) {
    // Generic error message - user exist karta hai ya nahi, mat batao
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Password verify karo (bcrypt)
  const isValid = await bcrypt.compare(password, user.passwordHash);
  
  if (!isValid) {
    // Failed login log karo
    if (db.loginAttempts) {
      await db.loginAttempts.create({
        data: {
          email,
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          success: false,
          timestamp: new Date()
        }
      });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // JWT Token generate karo
  const token = jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET || 'technova-super-secure-jwt-key-2026',
    { expiresIn: '24h' }
  );

  // HttpOnly cookie set karo (XSS protection)
  res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);

  // Successful login log karo
  if (db.loginAttempts) {
    await db.loginAttempts.create({
      data: {
        email,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        success: true,
        timestamp: new Date()
      }
    });
  }

  return res.status(200).json({ success: true, token, user: { email: user.email, role: user.role } });
}
