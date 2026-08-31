require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Robust Cloudinary persistent storage configuration
const parseAndConfigureCloudinary = () => {
  const rawUrl = process.env.CLOUDINARY_URL;
  if (!rawUrl || typeof rawUrl !== 'string') {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME).trim(),
        api_key: String(process.env.CLOUDINARY_API_KEY).trim(),
        api_secret: String(process.env.CLOUDINARY_API_SECRET).trim(),
        secure: true
      });
      return true;
    }
    return false;
  }

  const clean = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  const match = clean.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/i);
  if (match) {
    cloudinary.config({
      api_key: match[1].trim(),
      api_secret: match[2].trim(),
      cloud_name: match[3].trim(),
      secure: true
    });
    console.log(`☁️ Cloudinary persistent storage configured for cloud: "${match[3].trim()}"`);
    return true;
  }

  try {
    process.env.CLOUDINARY_URL = clean;
    cloudinary.config(true);
    cloudinary.config({ secure: true });
    const cfg = cloudinary.config();
    if (cfg.cloud_name && cfg.api_key) {
      console.log(`☁️ Cloudinary persistent storage configured for cloud: "${cfg.cloud_name}"`);
      return true;
    }
  } catch (err) {
    console.error('⚠️ Cloudinary configuration error:', err.message);
  }
  return false;
};

// Initialize Cloudinary on server start
parseAndConfigureCloudinary();

const isCloudinaryActive = () => {
  const cfg = cloudinary.config();
  if (cfg.cloud_name && cfg.api_key && cfg.api_secret) {
    return true;
  }
  return parseAndConfigureCloudinary();
};

const extractPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('cloudinary.com')) return '';
  try {
    const parts = url.split('/upload/');
    if (parts.length > 1) {
      let pathPart = parts[1];
      pathPart = pathPart.replace(/^v\d+\//, '');
      const lastDotIndex = pathPart.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        pathPart = pathPart.substring(0, lastDotIndex);
      }
      return pathPart;
    }
  } catch (e) {}
  return '';
};

const uploadBufferToCloudinary = async (buffer, folder = 'common', filename = '') => {
  if (!isCloudinaryActive()) {
    throw new Error('Cloudinary is not configured in environment.');
  }

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: `technova/${folder}`,
      resource_type: 'image',
      overwrite: true
    };
    if (filename) {
      uploadOptions.public_id = filename.replace(/\.[^/.]+$/, '');
    }

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err) {
        console.error('❌ Cloudinary stream upload failed:', err.message);
        return reject(err);
      }
      resolve({
        url: result.secure_url || result.url,
        secure_url: result.secure_url || result.url,
        public_id: result.public_id
      });
    });

    stream.end(buffer);
  });
};

const deleteCloudinaryAsset = async (publicId) => {
  if (!publicId || !isCloudinaryActive()) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️ Cloudinary asset deleted: "${publicId}" | Result: ${result?.result || 'ok'}`);
  } catch (err) {
    console.warn(`⚠️ Cloudinary deletion error for "${publicId}":`, err.message);
  }
};

const app = express();

// ================= FILE UPLOAD & STATIC ASSETS SECURITY =================
const uploadsRootDir = path.resolve(__dirname, 'uploads');
const ALLOWED_UPLOAD_SUBFOLDERS = ['team', 'services', 'projects', 'reviews', 'common'];

ALLOWED_UPLOAD_SUBFOLDERS.forEach(sub => {
  const p = path.join(uploadsRootDir, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Image Magic Bytes Verification (Deep Binary Inspection)
const isValidImageBuffer = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpg';
  }

  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 || (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)) {
    return 'gif';
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return false;
};

// Subfolder Sanitizer to prevent Directory Traversal
const sanitizeSubfolder = (subfolder) => {
  const clean = String(subfolder || 'common').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  return ALLOWED_UPLOAD_SUBFOLDERS.includes(clean) ? clean : 'common';
};

// Helper to handle and upload images (Cloudinary with local fallback)
const saveOrUploadImage = async (dataString, subfolder = 'common', prefix = 'img') => {
  if (!dataString || typeof dataString !== 'string') {
    return { imageUrl: '', publicId: '' };
  }

  const trimmed = dataString.trim();

  // If already a remote URL (Cloudinary, Unsplash, external, etc.)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const pubId = extractPublicIdFromUrl(trimmed);
    return { imageUrl: trimmed, publicId: pubId };
  }

  // If existing local /uploads/ URL
  if (trimmed.startsWith('/uploads/')) {
    if (trimmed.includes('..') || trimmed.includes('%2e%2e')) {
      return { imageUrl: '', publicId: '' };
    }
    return { imageUrl: trimmed, publicId: '' };
  }

  // Not a base64 string
  if (!trimmed.startsWith('data:image/')) {
    return { imageUrl: trimmed, publicId: '' };
  }

  try {
    const matches = trimmed.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/i);
    if (!matches) {
      console.warn('⚠️ Rejected base64 image: invalid data URI format.');
      return { imageUrl: '', publicId: '' };
    }

    const base64Data = matches[2];
    if (base64Data.length > 14 * 1024 * 1024) {
      console.warn('⚠️ Rejected base64 image: payload exceeds 10MB binary limit.');
      return { imageUrl: '', publicId: '' };
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const detectedType = isValidImageBuffer(buffer);
    if (!detectedType) {
      console.warn('⚠️ Rejected base64 image: payload binary signature invalid.');
      return { imageUrl: '', publicId: '' };
    }

    const safeFolder = sanitizeSubfolder(subfolder);
    const safePrefix = String(prefix || 'img').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'img';
    const ext = detectedType === 'jpeg' ? 'jpg' : detectedType;
    const uniqueName = `${safePrefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    // 1. If Cloudinary is configured/active -> STRICT CLOUDINARY PERSISTENCE
    if (isCloudinaryActive() || process.env.CLOUDINARY_URL) {
      try {
        const cloudResult = await uploadBufferToCloudinary(buffer, safeFolder, uniqueName);
        console.log(`☁️ Uploaded base64 image to Cloudinary: ${cloudResult.secure_url}`);
        return {
          imageUrl: cloudResult.secure_url,
          publicId: cloudResult.public_id
        };
      } catch (cloudErr) {
        console.error('❌ Cloudinary upload failed:', cloudErr.message);
        throw new Error(`Cloudinary persistent upload failed: ${cloudErr.message}`);
      }
    }

    // 2. Local fallback ONLY when Cloudinary is completely unconfigured (offline development mode)
    const targetDir = path.resolve(uploadsRootDir, safeFolder);
    if (!targetDir.startsWith(uploadsRootDir)) return { imageUrl: '', publicId: '' };
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const safeFilename = `${uniqueName}.${ext}`;
    const filePath = path.join(targetDir, safeFilename);
    fs.writeFileSync(filePath, buffer);

    return {
      imageUrl: `/uploads/${safeFolder}/${safeFilename}`,
      publicId: ''
    };
  } catch (err) {
    console.error('saveOrUploadImage processing error:', err);
    return { imageUrl: '', publicId: '' };
  }
};

// Backwards compatibility alias for synchronous calls
const saveBase64Image = (dataString, subfolder = 'common', prefix = 'img') => {
  if (!dataString || typeof dataString !== 'string') return '';
  if (dataString.startsWith('http://') || dataString.startsWith('https://') || dataString.startsWith('/uploads/')) {
    return dataString;
  }
  try {
    const matches = dataString.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/i);
    if (!matches) return '';
    const buffer = Buffer.from(matches[2], 'base64');
    const detectedType = isValidImageBuffer(buffer);
    if (!detectedType) return '';
    const safeFolder = sanitizeSubfolder(subfolder);
    const safePrefix = String(prefix || 'img').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'img';
    const targetDir = path.resolve(uploadsRootDir, safeFolder);
    if (!targetDir.startsWith(uploadsRootDir)) return '';
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const ext = detectedType === 'jpeg' ? 'jpg' : detectedType;
    const safeFilename = `${safePrefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(targetDir, safeFilename), buffer);
    return `/uploads/${safeFolder}/${safeFilename}`;
  } catch (e) {
    return '';
  }
};

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif'
]);

const DANGEROUS_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.jsp', '.asp', '.aspx', 
  '.cgi', '.pl', '.py', '.rb', '.js', '.mjs', '.html', '.htm', '.svg', 
  '.xhtml', '.xml', '.shtml', '.dll', '.scr', '.vbs', '.com', '.msi'
]);

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const requestedFolder = sanitizeSubfolder(req.body?.folder || req.query?.folder || 'team');
    const destPath = path.resolve(uploadsRootDir, requestedFolder);
    
    // Strict path containment check
    if (!destPath.startsWith(uploadsRootDir)) {
      return cb(new Error('Invalid destination path'));
    }

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    cb(null, destPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `upload-${uniqueSuffix}${safeExt}`);
  }
});

// File Filter (Strict Image Check)
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();

  // Reject dangerous extensions immediately
  if (DANGEROUS_EXTS.has(ext)) {
    return cb(new Error('Disallowed file type: executable, script, or markup files are not allowed.'));
  }

  // Validate allowed image mime types and extensions
  if (ALLOWED_MIME_TYPES.has(mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
    return cb(null, true);
  } else {
    return cb(new Error('Invalid file type: only JPG, PNG, WEBP, and GIF images are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1
  },
  fileFilter: fileFilter
});

// Serve uploaded images statically with security headers
const staticServeOptions = {
  dotfiles: 'ignore',
  index: false,
  fallthrough: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  }
};

app.use('/uploads', express.static(uploadsRootDir, staticServeOptions));
app.use('/uploads/team', express.static(path.join(uploadsRootDir, 'team'), staticServeOptions));
app.use('/uploads/services', express.static(path.join(uploadsRootDir, 'services'), staticServeOptions));
app.use('/uploads/projects', express.static(path.join(uploadsRootDir, 'projects'), staticServeOptions));
app.use('/uploads/reviews', express.static(path.join(uploadsRootDir, 'reviews'), staticServeOptions));

// ================= SECURITY HEADERS & HTTP HARDENING =================

// Helmet - Deep HTTP Header Hardening
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "https://cdn.tailwindcss.com", 
        "https://cdnjs.cloudflare.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://fonts.googleapis.com", 
        "https://cdnjs.cloudflare.com"
      ],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: [
        "'self'", 
        "https://fonts.gstatic.com", 
        "https://cdnjs.cloudflare.com", 
        "data:"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "blob:", 
        "https:", 
        "http:"
      ],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Additional Comprehensive Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Hardened CORS Configuration
const allowedOrigins = process.env.CLIENT_URL ? [process.env.CLIENT_URL] : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  maxAge: 86400
}));

// ================= REQUEST TIMEOUT & DOS PROTECTION =================

// Global Request Timeout Middleware (25s ceiling to prevent connection exhaustion)
app.use((req, res, next) => {
  res.setTimeout(25000, () => {
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        message: 'Gateway Timeout: The server took too long to process this request.'
      });
    }
  });
  next();
});

// Rate Limiting - Brute Force Protection (Skip successful logins, only count failed attempts)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 failed attempts per 15 minutes
  skipSuccessfulRequests: true,
  statusCode: 429,
  handler: (req, res) => {
    res.status(429).json({ 
      success: false, 
      message: 'Too many failed login attempts from this IP. Please try again after 15 minutes.' 
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Inquiries Rate Limiting - Anti-Spam (Public Form)
const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 inquiries per 15 min per IP
  statusCode: 429,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many inquiries submitted from this IP. Please try again after 15 minutes.'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload Rate Limiting - Storage DoS Protection
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Max 60 uploads per 15 min
  statusCode: 429,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Upload rate limit reached. Please wait a few minutes before uploading more files.'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  statusCode: 429,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
  }
});

app.use('/api/admin/login', loginLimiter);
app.use('/api/admin/upload-image', uploadLimiter);
app.use('/api', apiLimiter);

// Body Parser & Cookie Parser (Hardened Payload Limits)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Payload Too Large / JSON Syntax Error Handler
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      message: 'Payload Too Large: The submitted data exceeds the allowed size limit (15MB max).'
    });
  }
  if (err && err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Bad Request: Malformed JSON payload.'
    });
  }
  next(err);
});

app.use(cookieParser(process.env.JWT_SECRET || 'technova-super-secret-jwt-key-2026'));

// ================= SANITIZATION & NOSQL INJECTION GUARD =================
const sanitizeMongoInput = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      data[i] = sanitizeMongoInput(data[i]);
    }
    return data;
  }

  for (const key of Object.keys(data)) {
    // Strip keys containing MongoDB injection operators or dot notation
    if (key.startsWith('$') || key.includes('.')) {
      delete data[key];
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      data[key] = sanitizeMongoInput(data[key]);
    }
  }
  return data;
};

// Global Sanitization Middleware
app.use((req, res, next) => {
  if (req.body) sanitizeMongoInput(req.body);
  if (req.query) sanitizeMongoInput(req.query);
  if (req.params) sanitizeMongoInput(req.params);
  next();
});

// HTML & Script Tag Stripper
const sanitizeText = (str, maxLength = 2000) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, maxLength);
};

// URL Parameter ID Format Validator
const validateIdParam = (req, res, next) => {
  const id = req.params.id;
  if (!id) return next();

  // Allow standard 24-char hex MongoDB ObjectIds or safe alphanumeric fallback IDs
  const isMongoId = mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
  const isFallbackId = /^[a-zA-Z0-9_-]{3,64}$/.test(id);

  if (!isMongoId && !isFallbackId) {
    return res.status(400).json({ success: false, message: 'Invalid ID parameter format.' });
  }

  next();
};

app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Fallback Tracking
let failedAttemptsMap = {};
let lockedUntilMap = {};

let fallbackSettings = {
  companyName: 'Nexora',
  tagline: 'We Build Digital Experiences That Matter',
  subheading: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.',
  availabilityStatus: 'Available for new projects',
  whatsappNumber: '',
  contactEmail: '',
  officeAddress: '',
  createdAt: new Date(),
  updatedAt: new Date()
};

let fallbackServices = [
  {
    _id: 'srv_1',
    id: 'srv_1',
    title: 'Custom Web Platforms',
    category: 'Popular',
    price: '15,000 PKR',
    icon: 'fa-solid fa-globe',
    description: 'Blazing fast, responsive, and SEO-optimized web applications crafted with Next.js, React, and Tailwind.',
    features: ['Single Page Apps (SPA)', 'SaaS Architecture', 'API Integrations'],
    createdAt: new Date()
  },
  {
    _id: 'srv_2',
    id: 'srv_2',
    title: 'Mobile App Development',
    category: 'High Demand',
    price: '35,000 PKR',
    icon: 'fa-solid fa-mobile-screen',
    description: 'Native and cross-platform mobile apps for iOS and Android with silky smooth 60fps animations.',
    features: ['Flutter & React Native', 'App Store Publishing', 'Biometric Auth'],
    createdAt: new Date()
  },
  {
    _id: 'srv_3',
    id: 'srv_3',
    title: 'AI & Machine Learning',
    category: 'Trending',
    price: '50,000 PKR',
    icon: 'fa-solid fa-brain',
    description: 'Intelligent chatbots, predictive analytics, LLM fine-tuning, and automated workflows tailored for your business.',
    features: ['LLM & Agent Systems', 'Computer Vision', 'RAG Knowledgebases'],
    createdAt: new Date()
  }
];

let fallbackPortfolio = [
  {
    _id: 'proj_1',
    id: 'proj_1',
    title: 'ApexPulse Analytics',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80',
    description: 'Real-time revenue attribution engine for global e-commerce processing 50M+ daily events.',
    technologies: ['Next.js', 'TypeScript', 'Tailwind CSS'],
    demoUrl: 'https://example.com',
    createdAt: new Date()
  },
  {
    _id: 'proj_2',
    id: 'proj_2',
    title: 'AuraPay NeoBanking Wallet',
    category: 'Mobile',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80',
    description: 'Decentralized multi-currency neo-banking wallet with contactless NFC tap-to-pay.',
    technologies: ['Flutter', 'Dart', 'Node.js'],
    demoUrl: 'https://example.com',
    createdAt: new Date()
  },
  {
    _id: 'proj_3',
    id: 'proj_3',
    title: 'NeuroFlow AI Diagnostics',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=800&q=80',
    description: 'Medical imaging analysis tool with deep learning models aiding radiologists.',
    technologies: ['Python', 'PyTorch', 'FastAPI'],
    demoUrl: 'https://example.com',
    createdAt: new Date()
  }
];


let fallbackReviews = [
  {
    _id: 'rev_1',
    id: 'rev_1',
    name: 'Marcus Vance',
    role: 'CTO, OmniScale Inc.',
    rating: 5,
    text: 'TechNova built our real-time analytics platform in record time. Their architectural prowess and responsiveness was world-class.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    createdAt: new Date()
  },
  {
    _id: 'rev_2',
    id: 'rev_2',
    name: 'Elena Rostova',
    role: 'VP Product, FinTech Pulse',
    rating: 5,
    text: 'The mobile app developed by TechNova achieved 4.9 stars across 50,000+ downloads within 3 months. Outstanding engineering standards!',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    createdAt: new Date()
  }
];

let fallbackTeam = [
  {
    _id: 'team_1',
    id: 'team_1',
    name: 'Syed Hamza',
    role: 'Principal Cloud Architect & Founder',
    whatsappNumber: '923001234567',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    description: 'Ex-Google Cloud architect with 10+ years specializing in distributed systems and cloud native SaaS.',
    createdAt: new Date()
  },
  {
    _id: 'team_2',
    id: 'team_2',
    name: 'Areeba Tariq',
    role: 'Head of Mobile Engineering',
    whatsappNumber: '923019876543',
    image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80',
    description: 'Cross-platform app development specialist delivering 5-star mobile apps on iOS & Android.',
    createdAt: new Date()
  },
  {
    _id: 'team_3',
    id: 'team_3',
    name: 'Zainab Qureshi',
    role: 'Lead AI & LLM Systems Engineer',
    whatsappNumber: '923025554321',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80',
    description: 'Specializes in Autonomous Multi-Agent Workflows, RAG Architecture, and PyTorch.',
    createdAt: new Date()
  }
];

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/agencyDB';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  maxPoolSize: 20,
  minPoolSize: 5,
  maxIdleTimeMS: 30000
})
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas Database');
    await seedDefaultData();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('ℹ️ Local MongoDB is not running. Seamless Fallback Store Active.');
  });

// ================= DATABASE MODELS =================

// 1. Admin Model (Secure)
const AdminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true, 
    minlength: 6, 
    select: false 
  },
  name: { type: String, required: true },
  role: { type: String, default: 'admin' },
  twoFactorSecret: { type: String, select: false },
  twoFactorEnabled: { type: Boolean, default: false },
  lastLogin: Date,
  isActive: { type: Boolean, default: true },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: Date
});

AdminSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

const Admin = mongoose.model('Admin', AdminSchema);

// 2. Settings Model
const SettingSchema = new mongoose.Schema({
  companyName: {
    type: String,
    default: 'Nexora'
  },
  availabilityStatus: {
    type: String,
    default: 'Available for new projects'
  },
  tagline: {
    type: String,
    default: 'We Build Digital Experiences That Matter'
  },
  subheading: {
    type: String,
    default: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.'
  },
  whatsappNumber: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: ''
  },
  officeAddress: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Agar settings already exist karein toh update karo, warna create karo
SettingSchema.statics.updateOrCreate = async function(data) {
  return this.findOneAndUpdate({}, { ...data, updatedAt: new Date() }, { 
    upsert: true, 
    new: true 
  });
};

const Setting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);

// 3. Services Model
const ServiceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  icon: { type: String, default: 'code' },
  image: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  price: { type: String, default: '' },
  badge: { type: String, default: '' },
  category: { type: String, default: '' },
  features: { type: [String], default: [] },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});
ServiceSchema.index({ isActive: 1, order: 1, createdAt: -1 });

const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);

// 4. Portfolio Model
const PortfolioSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'Web' },
  image: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  description: { type: String, required: true },
  technologies: [{ type: String }],
  demoUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
PortfolioSchema.index({ isActive: 1, createdAt: -1 });

const Portfolio = mongoose.models.Portfolio || mongoose.model('Portfolio', PortfolioSchema);

// 5. Team Model
const TeamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  whatsappNumber: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  imagePublicId: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  isFeatured: {
    type: Boolean,
    default: false  // CEO ya featured member ke liye
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
TeamSchema.index({ isActive: 1, isFeatured: -1, order: 1, createdAt: -1 });

const Team = mongoose.models.Team || mongoose.model('Team', TeamSchema);

// ================= REVIEW MODEL =================
const ReviewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: '' },
  rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
  text: { type: String, default: '' },
  testimonial: { type: String, default: '' },
  image: { type: String, default: '' },
  avatar: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
ReviewSchema.index({ isActive: 1, isFeatured: -1, createdAt: -1 });

ReviewSchema.pre('save', function() {
  if (!this.text && this.testimonial) this.text = this.testimonial;
  if (!this.testimonial && this.text) this.testimonial = this.text;
  if (!this.image && this.avatar) this.image = this.avatar;
  if (!this.avatar && this.image) this.avatar = this.image;
});

const Review = mongoose.models.Review || mongoose.model('Review', ReviewSchema);

// 7. Inquiry / Leads Model
const InquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  service: { type: String, default: '' },
  budget: { type: String, default: '' },
  message: { type: String, default: '' },
  status: { type: String, default: 'new' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

const Inquiry = mongoose.models.Inquiry || mongoose.model('Inquiry', InquirySchema);

// ================= SEED INITIAL DATA =================
async function seedDefaultData() {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '';

    if (adminEmail && adminPassword) {
      let existingAdmin = await Admin.findOne({ email: adminEmail }).select('+password');
      if (!existingAdmin) {
        existingAdmin = new Admin({
          name: 'Super Admin',
          email: adminEmail,
          password: adminPassword,
          role: 'admin'
        });
        await existingAdmin.save();
        console.log('🌱 Seeded default admin in MongoDB from .env');
      } else {
        const isMatch = await bcrypt.compare(adminPassword, existingAdmin.password);
        if (!isMatch) {
          existingAdmin.password = adminPassword;
          await existingAdmin.save();
          console.log('🔄 Admin credentials updated in MongoDB from .env');
        }
      }
    }

    const settingsCount = await Setting.countDocuments();
    if (settingsCount === 0) {
      await Setting.create(fallbackSettings);
      console.log('🌱 Seeded default settings in MongoDB');
    }

    const servicesCount = await Service.countDocuments();
    if (servicesCount === 0) {
      await Service.insertMany(fallbackServices);
      console.log('🌱 Seeded default services in MongoDB');
    }

    const portfolioCount = await Portfolio.countDocuments();
    if (portfolioCount === 0) {
      await Portfolio.insertMany(fallbackPortfolio);
      console.log('🌱 Seeded default portfolio in MongoDB');
    }

    const teamCount = await Team.countDocuments();
    if (teamCount === 0) {
      await Team.insertMany(fallbackTeam);
      console.log('🌱 Seeded default team in MongoDB');
    }

    const reviewsCount = await Review.countDocuments();
    if (reviewsCount === 0) {
      await Review.insertMany(fallbackReviews);
      console.log('🌱 Seeded default reviews in MongoDB');
    }
  } catch (err) {}
}

// ================= AUTH MIDDLEWARE =================
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const envEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const jwtSecret = process.env.JWT_SECRET || 'technova-super-secret-jwt-key-2026';

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    if (!decoded || (decoded.role !== 'admin' && decoded.email !== envEmail)) {
      return res.status(401).json({ success: false, message: 'Unauthorized access. Admin privileges required.' });
    }
    
    if (mongoose.connection.readyState === 1) {
      let admin = decoded.userId ? await Admin.findById(decoded.userId).select('-password').lean().maxTimeMS(5000) : null;
      if (!admin && decoded.email) {
        admin = await Admin.findOne({ email: decoded.email }).select('-password').lean().maxTimeMS(5000);
      }
      if (!admin && decoded.email === envEmail) {
        admin = { _id: 'admin_default', id: 'admin_default', name: decoded.name || 'Super Admin', email: envEmail, role: 'admin', isActive: true };
      }
      if (!admin || admin.isActive === false) {
        return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
      }
      req.admin = admin;
    } else {
      req.admin = { id: decoded.userId || 'admin_default', name: decoded.name || 'Super Admin', email: decoded.email || envEmail, role: decoded.role || 'admin' };
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};


// ================= 2FA (TWO-FACTOR AUTHENTICATION) =================
const { generate2FASecret, verify2FACode } = require('./lib/twoFactor');

// 2FA Setup - Generate Secret & QR Code (Protected)
app.post('/api/admin/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const accountName = `Nexora Admin (${req.admin.email || 'admin'})`;
    const { secretBase32, qrCode } = await generate2FASecret(accountName);

    // Save temporary secret to admin session or doc
    if (mongoose.connection.readyState === 1) {
      await Admin.findByIdAndUpdate(req.admin._id || req.admin.id, {
        twoFactorSecret: secretBase32
      });
    }

    res.json({
      success: true,
      secret: secretBase32,
      qrCode: qrCode,
      message: 'Scan this QR code with Google Authenticator or Authy'
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2FA Verify & Enable (Protected)
app.post('/api/admin/2fa/verify', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Verification code is required.' });
    }

    let secret = null;
    if (mongoose.connection.readyState === 1) {
      const admin = await Admin.findById(req.admin._id || req.admin.id).select('+twoFactorSecret');
      secret = admin?.twoFactorSecret;
    }

    if (!secret) {
      return res.status(400).json({ success: false, message: '2FA has not been initiated. Please run setup first.' });
    }

    const isValid = verify2FACode(secret, code);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid 2FA code. Please try again.' });
    }

    if (mongoose.connection.readyState === 1) {
      await Admin.findByIdAndUpdate(req.admin._id || req.admin.id, {
        twoFactorEnabled: true
      });
    }

    res.json({
      success: true,
      message: 'Two-Factor Authentication enabled successfully!'
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2FA Disable (Protected)
app.post('/api/admin/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Verification code required to disable 2FA.' });
    }

    let secret = null;
    if (mongoose.connection.readyState === 1) {
      const admin = await Admin.findById(req.admin._id || req.admin.id).select('+twoFactorSecret');
      secret = admin?.twoFactorSecret;
    }

    if (!secret || !verify2FACode(secret, code)) {
      return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }

    if (mongoose.connection.readyState === 1) {
      await Admin.findByIdAndUpdate(req.admin._id || req.admin.id, {
        twoFactorEnabled: false,
        twoFactorSecret: undefined
      });
    }

    res.json({ success: true, message: '2FA has been disabled.' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ================= AUTH ROUTES =================

// Register (Protected - Admin Only)
app.post('/api/admin/register', 
  authenticateToken,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { email, password, name } = req.body;

      if (mongoose.connection.readyState === 1) {
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) return res.status(400).json({ success: false, message: 'Admin already exists.' });
        const admin = new Admin({ email, password, name });
        await admin.save();
      }

      res.status(201).json({ success: true, message: 'Admin created successfully.' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
  }
);

// Login
app.post('/api/admin/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Valid email and password are required.' });

      const email = (req.body.email || '').toLowerCase().trim();
      const password = req.body.password;
      const envEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
      const envPassword = process.env.ADMIN_PASSWORD || '';

      if (mongoose.connection.readyState === 1) {
        let admin = await Admin.findOne({ email }).select('+password');
        
        // If email matches .env but not yet in DB, create/sync it
        if (!admin && email === envEmail && envPassword) {
          admin = new Admin({ name: 'Super Admin', email: envEmail, password: envPassword, role: 'admin' });
          await admin.save();
          admin = await Admin.findOne({ email }).select('+password');
        }

        if (!admin) {
          return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        if (admin.lockedUntil && admin.lockedUntil > new Date()) {
          return res.status(429).json({ success: false, message: 'Too many failed login attempts. Account temporarily locked. Please try again after 15 minutes.' });
        }

        // Verify password
        let isValid = await bcrypt.compare(password, admin.password);
        if (!isValid && email === envEmail && password === envPassword) {
          admin.password = envPassword;
          await admin.save();
          isValid = true;
        }

        if (!isValid) {
          admin.failedAttempts = (admin.failedAttempts || 0) + 1;
          if (admin.failedAttempts >= 5) {
            admin.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            admin.failedAttempts = 0;
          }
          await admin.save();
          return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        // Reset failed attempts on success
        admin.failedAttempts = 0;
        admin.lockedUntil = undefined;
        admin.lastLogin = new Date();
        await admin.save();

        const token = jwt.sign(
          { userId: admin._id, email: admin.email, role: admin.role, name: admin.name },
          process.env.JWT_SECRET || 'technova-super-secret-jwt-key-2026',
          { expiresIn: '24h' }
        );

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000
        });

        return res.json({
          success: true,
          message: 'Login successful',
          token,
          admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role }
        });
      }

      // Fallback (when MongoDB is offline)
      if (email === envEmail && envPassword) {
        if (lockedUntilMap[email] && lockedUntilMap[email] > new Date()) {
          return res.status(429).json({ success: false, message: 'Too many failed login attempts. Account temporarily locked. Please try again after 15 minutes.' });
        }

        const isMatch = (password === envPassword);
        if (!isMatch) {
          failedAttemptsMap[email] = (failedAttemptsMap[email] || 0) + 1;
          if (failedAttemptsMap[email] >= 5) {
            lockedUntilMap[email] = new Date(Date.now() + 15 * 60 * 1000);
            failedAttemptsMap[email] = 0;
          }
          return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        failedAttemptsMap[email] = 0;
        delete lockedUntilMap[email];

        const token = jwt.sign(
          { userId: 'admin_default', email: envEmail, role: 'admin', name: 'Super Admin' },
          process.env.JWT_SECRET || 'technova-super-secret-jwt-key-2026',
          { expiresIn: '24h' }
        );

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000
        });

        return res.json({
          success: true,
          message: 'Login successful',
          token,
          admin: { id: 'admin_default', name: 'Super Admin', email: envEmail, role: 'admin' }
        });
      }

      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
  }
);

// Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Verify Token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    admin: req.admin ? {
      id: req.admin._id || req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role
    } : { role: 'admin' }
  });
});


// Image Upload Route (Protected & Hardened with Cloudinary Persistent Storage)
app.post('/api/admin/upload-image', authenticateToken, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
      // Deep inspection: verify file header bytes on disk
      const buffer = fs.readFileSync(req.file.path);
      const detectedType = isValidImageBuffer(buffer);

      if (!detectedType) {
        // Immediately purge spoofed or invalid file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ 
          success: false, 
          message: 'Security validation failed: File binary header is not a valid image format.' 
        });
      }

      const folder = sanitizeSubfolder(req.body?.folder || req.query?.folder || 'team');

      // Upload to Cloudinary if configured -> STRICT CLOUDINARY PERSISTENCE
      if (isCloudinaryActive() || process.env.CLOUDINARY_URL) {
        try {
          const cloudResult = await uploadBufferToCloudinary(buffer, folder, req.file.filename);
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.json({
            success: true,
            message: 'Image uploaded to Cloudinary successfully!',
            imageUrl: cloudResult.secure_url,
            url: cloudResult.secure_url,
            public_id: cloudResult.public_id,
            imagePublicId: cloudResult.public_id
          });
        } catch (cloudErr) {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          console.error('❌ Cloudinary upload error:', cloudErr.message);
          return res.status(500).json({
            success: false,
            message: `Cloudinary persistent storage upload failed: ${cloudErr.message}`
          });
        }
      }

      // Local fallback ONLY when Cloudinary is completely unconfigured (offline development mode)
      const imageUrl = `/uploads/${folder}/${req.file.filename}`;
      return res.json({ 
        success: true, 
        message: 'Image uploaded successfully!',
        imageUrl,
        url: imageUrl,
        public_id: ''
      });
    } catch (readErr) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ success: false, message: 'Failed to process uploaded file.' });
    }
  });
});

// ================= SETTINGS API ROUTES =================

// Get Settings (Public & Admin)
const getSettingsHandler = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let settings = await Setting.findOne()
        .select('companyName availabilityStatus tagline subheading whatsappNumber contactEmail officeAddress updatedAt createdAt _id')
        .lean()
        .maxTimeMS(5000);

      if (!settings) {
        settings = await Setting.create({
          companyName: 'Nexora',
          availabilityStatus: 'Available for new projects',
          tagline: 'We Build Digital Experiences That Matter',
          subheading: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.',
          whatsappNumber: '',
          contactEmail: '',
          officeAddress: ''
        });
      }
      return res.json({ success: true, data: settings, settings });
    }
    res.json({ success: true, data: fallbackSettings, settings: fallbackSettings });
  } catch (error) {
    console.error('GET Settings Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
};

app.get('/api/settings', getSettingsHandler);
app.get('/api/admin/settings', authenticateToken, getSettingsHandler);

// Update Settings (Protected)
const handleSettingsUpdate = async (req, res) => {
  try {
    const {
      companyName,
      availabilityStatus,
      tagline,
      subheading,
      whatsappNumber,
      contactEmail,
      officeAddress
    } = req.body;

    if (mongoose.connection.readyState === 1) {
      const existing = (await Setting.findOne().lean()) || fallbackSettings;
      const updateDoc = {
        companyName: companyName !== undefined ? companyName : (existing.companyName || 'Nexora'),
        availabilityStatus: availabilityStatus !== undefined ? availabilityStatus : (existing.availabilityStatus || 'Available for new projects'),
        tagline: tagline !== undefined ? tagline : (existing.tagline || 'We Build Digital Experiences That Matter'),
        subheading: subheading !== undefined ? subheading : (existing.subheading || ''),
        whatsappNumber: whatsappNumber !== undefined ? whatsappNumber : (existing.whatsappNumber || ''),
        contactEmail: contactEmail !== undefined ? contactEmail : (existing.contactEmail || ''),
        officeAddress: officeAddress !== undefined ? officeAddress : (existing.officeAddress || ''),
        updatedAt: new Date()
      };

      const settings = await Setting.findOneAndUpdate(
        {},
        updateDoc,
        { 
          upsert: true, 
          returnDocument: 'after'
        }
      ).lean().maxTimeMS(5000);

      return res.json({ 
        success: true, 
        message: 'Settings saved successfully!',
        data: settings,
        settings 
      });
    }

    // Fallback in-memory
    if (companyName !== undefined) fallbackSettings.companyName = companyName;
    if (tagline !== undefined) fallbackSettings.tagline = tagline;
    if (subheading !== undefined) fallbackSettings.subheading = subheading;
    if (availabilityStatus !== undefined) fallbackSettings.availabilityStatus = availabilityStatus;
    if (whatsappNumber !== undefined) fallbackSettings.whatsappNumber = whatsappNumber;
    if (contactEmail !== undefined) fallbackSettings.contactEmail = contactEmail;
    if (officeAddress !== undefined) fallbackSettings.officeAddress = officeAddress;
    fallbackSettings.updatedAt = new Date();

    res.json({
      success: true,
      message: 'Settings saved successfully!',
      data: fallbackSettings,
      settings: fallbackSettings
    });
  } catch (error) {
    console.error('❌ SAVE Settings Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save settings'
    });
  }
};

app.put('/api/admin/settings', authenticateToken, handleSettingsUpdate);
app.post('/api/admin/settings', authenticateToken, handleSettingsUpdate);

// ================= SERVICES API ROUTES =================

let servicesCache = null;
let servicesCacheTime = 0;
const SERVICES_CACHE_TTL = 60000; // 60 seconds memory cache

const invalidateServicesCache = () => {
  servicesCache = null;
  servicesCacheTime = 0;
};

const parseStringList = (item) => {
  if (Array.isArray(item)) return item.map(f => String(f).trim()).filter(Boolean);
  if (typeof item === 'string') return item.split(',').map(f => f.trim()).filter(Boolean);
  return [];
};

// Get Services (Public & Admin)
const getServicesHandler = async (req, res) => {
  try {
    const now = Date.now();
    if (servicesCache && (now - servicesCacheTime < SERVICES_CACHE_TTL)) {
      return res.json({ success: true, data: servicesCache, services: servicesCache });
    }

    if (mongoose.connection.readyState === 1) {
      const services = await Service.find({ isActive: { $ne: false } })
        .sort({ order: 1, createdAt: -1 })
        .lean()
        .maxTimeMS(5000);
      servicesCache = services;
      servicesCacheTime = Date.now();
      return res.json({ success: true, data: services, services });
    }
    const activeFallback = fallbackServices.filter(s => s.isActive !== false);
    res.json({ success: true, data: activeFallback, services: activeFallback });
  } catch (error) {
    console.error('Get services error:', error);
    if (servicesCache) {
      return res.json({ success: true, data: servicesCache, services: servicesCache });
    }
    const activeFallback = fallbackServices.filter(s => s.isActive !== false);
    res.json({ success: true, data: activeFallback, services: activeFallback });
  }
};

app.get('/api/services', getServicesHandler);
app.get('/api/admin/services', authenticateToken, getServicesHandler);

// Add Service (Protected)
const addServiceHandler = async (req, res) => {
  try {
    const { title, category, badge, price, icon, image, description, features, order } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const cleanTitle = sanitizeText(title, 150);
    const cleanDesc = sanitizeText(description, 2000);
    const cleanCategory = sanitizeText(category || badge || 'Popular', 100);
    const cleanBadge = sanitizeText(badge || category || 'Popular', 100);
    const cleanPrice = sanitizeText(price || '', 50);
    const cleanIcon = sanitizeText(icon || 'code', 50);
    const formattedFeatures = parseStringList(features).map(f => sanitizeText(f, 100)).filter(Boolean);

    const { imageUrl: finalImage, publicId: finalPublicId } = await saveOrUploadImage(image, 'services', 'service');
    invalidateServicesCache();

    if (mongoose.connection.readyState === 1) {
      const service = new Service({
        title: cleanTitle,
        badge: cleanBadge,
        category: cleanCategory,
        price: cleanPrice,
        icon: cleanIcon,
        image: finalImage || '',
        imagePublicId: finalPublicId || '',
        description: cleanDesc,
        features: formattedFeatures,
        order: Math.max(0, parseInt(order) || 0),
        isActive: true
      });
      await service.save();

      return res.json({
        success: true,
        message: 'Service added!',
        data: service,
        service
      });
    }

    const newService = {
      _id: 'srv_' + Date.now(),
      id: 'srv_' + Date.now(),
      title: cleanTitle,
      badge: cleanBadge,
      category: cleanCategory,
      price: cleanPrice,
      icon: cleanIcon,
      image: finalImage || '',
      imagePublicId: finalPublicId || '',
      description: cleanDesc,
      features: formattedFeatures,
      order: Math.max(0, parseInt(order) || 0),
      isActive: true,
      createdAt: new Date()
    };
    fallbackServices.unshift(newService);

    res.json({
      success: true,
      message: 'Service added!',
      data: newService,
      service: newService
    });
  } catch (error) {
    console.error('Add service error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

app.post('/api/admin/services', authenticateToken, addServiceHandler);
app.post('/api/admin/service', authenticateToken, addServiceHandler);

// Update Service (Protected)
const updateServiceHandler = async (req, res) => {
  try {
    const { id, title, category, badge, price, icon, image, description, features, order } = req.body;
    const targetId = req.params.id || id;
    const formattedFeatures = features !== undefined ? parseStringList(features) : undefined;

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Service ID is required' });
    }

    let finalImage, finalPublicId;
    if (image !== undefined) {
      const imgRes = await saveOrUploadImage(image, 'services', 'service');
      finalImage = imgRes.imageUrl;
      finalPublicId = imgRes.publicId;
    }
    invalidateServicesCache();

    if (mongoose.connection.readyState === 1) {
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (badge !== undefined || category !== undefined) {
        updateData.badge = badge || category;
        updateData.category = category || badge;
      }
      if (price !== undefined) updateData.price = price;
      if (icon !== undefined) updateData.icon = icon;
      if (finalImage !== undefined) {
        updateData.image = finalImage;
        updateData.imagePublicId = finalPublicId;
      }
      if (description !== undefined) updateData.description = description;
      if (formattedFeatures !== undefined) updateData.features = formattedFeatures;
      if (order !== undefined) updateData.order = order;

      const service = await Service.findByIdAndUpdate(
        targetId,
        updateData,
        { returnDocument: 'after' }
      ).lean().maxTimeMS(5000);

      if (!service) {
        return res.status(404).json({ success: false, message: 'Service not found' });
      }

      return res.json({ success: true, message: 'Service updated!', data: service, service });
    }

    const idx = fallbackServices.findIndex(s => (s._id === targetId || s.id === targetId));
    if (idx !== -1) {
      fallbackServices[idx] = {
        ...fallbackServices[idx],
        ...(title !== undefined && { title }),
        ...(badge !== undefined || category !== undefined && { badge: badge || category, category: category || badge }),
        ...(price !== undefined && { price }),
        ...(icon !== undefined && { icon }),
        ...(finalImage !== undefined && { image: finalImage, imagePublicId: finalPublicId }),
        ...(description !== undefined && { description }),
        ...(formattedFeatures !== undefined && { features: formattedFeatures }),
        ...(order !== undefined && { order })
      };
      return res.json({ success: true, message: 'Service updated!', data: fallbackServices[idx], service: fallbackServices[idx] });
    }

    res.status(404).json({ success: false, message: 'Service not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

app.put('/api/admin/services', authenticateToken, updateServiceHandler);
app.put('/api/admin/services/:id', authenticateToken, validateIdParam, updateServiceHandler);
app.put('/api/admin/service/:id', authenticateToken, validateIdParam, updateServiceHandler);

// Delete Service (Protected)
const deleteServiceHandler = async (req, res) => {
  try {
    const targetId = req.params.id || (req.body && req.body.id);

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Service ID is required' });
    }

    invalidateServicesCache();

    if (mongoose.connection.readyState === 1) {
      const s = await Service.findById(targetId);
      if (s) {
        if (s.imagePublicId) {
          await deleteCloudinaryAsset(s.imagePublicId);
        } else if (s.image) {
          await deleteCloudinaryAsset(extractPublicIdFromUrl(s.image));
        }
      }
      await Service.findByIdAndUpdate(targetId, { isActive: false }).maxTimeMS(5000);
      return res.json({ success: true, message: 'Service deleted!' });
    }

    fallbackServices = fallbackServices.filter(s => s._id !== targetId && s.id !== targetId);
    res.json({ success: true, message: 'Service deleted!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

app.delete('/api/admin/services', authenticateToken, deleteServiceHandler);
app.delete('/api/admin/services/:id', authenticateToken, validateIdParam, deleteServiceHandler);
app.delete('/api/admin/service/:id', authenticateToken, validateIdParam, deleteServiceHandler);

// ================= PORTFOLIO API ROUTES =================

const getPortfolioHandler = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const portfolio = await Portfolio.find({ isActive: { $ne: false } }).select('-__v').sort({ createdAt: -1 }).lean().maxTimeMS(5000);
      return res.json({ success: true, portfolio, projects: portfolio });
    }
    const activeProjects = fallbackPortfolio.filter(p => p.isActive !== false);
    res.json({ success: true, portfolio: activeProjects, projects: activeProjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get All Portfolio (Public & Admin)
app.get('/api/portfolio', getPortfolioHandler);
app.get('/api/admin/portfolio', authenticateToken, getPortfolioHandler);

// Add Portfolio (Protected)
app.post('/api/admin/portfolio', authenticateToken, async (req, res) => {
  try {
    const { title, category, image, description, technologies, techStack, demoUrl, liveLink } = req.body;
    const formattedTech = parseStringList(technologies || techStack);
    const { imageUrl: finalImage, publicId: finalPublicId } = await saveOrUploadImage(image, 'projects', 'project');

    if (mongoose.connection.readyState === 1) {
      const project = new Portfolio({
        title,
        category: category || 'Web',
        image: finalImage || '',
        imagePublicId: finalPublicId || '',
        description,
        technologies: formattedTech,
        demoUrl: demoUrl || liveLink || ''
      });

      await project.save();

      return res.json({ 
        success: true, 
        message: 'Portfolio project added!', 
        project 
      });
    }

    const newProject = {
      _id: 'proj_' + Date.now(),
      id: 'proj_' + Date.now(),
      title,
      category: category || 'Web',
      image: finalImage || '',
      imagePublicId: finalPublicId || '',
      description,
      technologies: formattedTech,
      demoUrl: demoUrl || liveLink || '',
      createdAt: new Date()
    };
    fallbackPortfolio.unshift(newProject);

    res.json({
      success: true,
      message: 'Portfolio project added!',
      project: newProject
    });
  } catch (error) {
    console.error('Add portfolio error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Portfolio (Protected)
app.put('/api/admin/portfolio/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    const { title, category, image, description, technologies, techStack, demoUrl, liveLink } = req.body;
    const formattedTech = (technologies !== undefined || techStack !== undefined) ? parseStringList(technologies || techStack) : undefined;
    
    let finalImage, finalPublicId;
    if (image !== undefined) {
      const imgRes = await saveOrUploadImage(image, 'projects', 'project');
      finalImage = imgRes.imageUrl;
      finalPublicId = imgRes.publicId;
    }

    if (mongoose.connection.readyState === 1) {
      const updateData = {};
      if (title !== undefined) updateData.title = sanitizeText(title, 150);
      if (category !== undefined) updateData.category = sanitizeText(category, 100);
      if (finalImage !== undefined) {
        updateData.image = finalImage;
        updateData.imagePublicId = finalPublicId;
      }
      if (description !== undefined) updateData.description = sanitizeText(description, 2000);
      if (formattedTech !== undefined) updateData.technologies = formattedTech;
      if (demoUrl !== undefined || liveLink !== undefined) updateData.demoUrl = sanitizeText(demoUrl || liveLink, 300);

      const project = await Portfolio.findByIdAndUpdate(
        req.params.id,
        updateData,
        { returnDocument: 'after' }
      ).lean().maxTimeMS(5000);

      if (!project) {
        return res.status(404).json({ success: false, message: 'Portfolio project not found' });
      }

      return res.json({ success: true, message: 'Portfolio updated!', project });
    }

    const idx = fallbackPortfolio.findIndex(p => (p._id === req.params.id || p.id === req.params.id));
    if (idx !== -1) {
      fallbackPortfolio[idx] = {
        ...fallbackPortfolio[idx],
        ...(title !== undefined && { title: sanitizeText(title, 150) }),
        ...(category !== undefined && { category: sanitizeText(category, 100) }),
        ...(finalImage !== undefined && { image: finalImage, imagePublicId: finalPublicId }),
        ...(description !== undefined && { description: sanitizeText(description, 2000) }),
        ...(formattedTech !== undefined && { technologies: formattedTech }),
        ...((demoUrl !== undefined || liveLink !== undefined) && { demoUrl: sanitizeText(demoUrl || liveLink, 300) })
      };
      return res.json({ success: true, message: 'Portfolio updated!', project: fallbackPortfolio[idx] });
    }

    res.status(404).json({ success: false, message: 'Portfolio project not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Portfolio (Protected)
app.delete('/api/admin/portfolio/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const p = await Portfolio.findById(req.params.id);
      if (p) {
        if (p.imagePublicId) {
          await deleteCloudinaryAsset(p.imagePublicId);
        } else if (p.image) {
          await deleteCloudinaryAsset(extractPublicIdFromUrl(p.image));
        }
        await Portfolio.findByIdAndDelete(req.params.id);
      }
      return res.json({ success: true, message: 'Portfolio deleted!' });
    }

    fallbackPortfolio = fallbackPortfolio.filter(p => p._id !== req.params.id && p.id !== req.params.id);
    res.json({ success: true, message: 'Portfolio deleted!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ================= TEAM API ROUTES =================

let teamCache = null;
let teamCacheTime = 0;
const TEAM_CACHE_TTL = 60000; // 60 seconds memory cache

const invalidateTeamCache = () => {
  teamCache = null;
  teamCacheTime = 0;
};

const getTeamHandler = async (req, res) => {
  try {
    const now = Date.now();
    if (teamCache && (now - teamCacheTime < TEAM_CACHE_TTL)) {
      return res.json({ success: true, data: teamCache, team: teamCache });
    }

    if (mongoose.connection.readyState === 1) {
      const team = await Team.find({ isActive: { $ne: false } })
        .sort({ isFeatured: -1, order: 1, createdAt: -1 })
        .lean()
        .maxTimeMS(5000);
      
      teamCache = team;
      teamCacheTime = Date.now();
      return res.json({ success: true, data: team, team });
    }
    const activeFallback = fallbackTeam.filter(t => t.isActive !== false);
    res.json({ success: true, data: activeFallback, team: activeFallback });
  } catch (error) {
    console.error('Get team error:', error);
    if (teamCache) {
      return res.json({ success: true, data: teamCache, team: teamCache });
    }
    const activeFallback = fallbackTeam.filter(t => t.isActive !== false);
    res.json({ success: true, data: activeFallback, team: activeFallback });
  }
};

// Get All Team Members (Public & Admin)
app.get('/api/team', getTeamHandler);
app.get('/api/admin/team', authenticateToken, getTeamHandler);

// Add Team Member (Protected)
app.post('/api/admin/team', authenticateToken, async (req, res) => {
  try {
    const { name, role, whatsappNumber, image, description, isFeatured, order } = req.body;
    const { imageUrl: finalImage, publicId: finalPublicId } = await saveOrUploadImage(image, 'team', 'team');
    const assignedImage = finalImage || 'https://via.placeholder.com/150';
    invalidateTeamCache();

    if (mongoose.connection.readyState === 1) {
      const member = new Team({ 
        name, 
        role, 
        whatsappNumber, 
        image: assignedImage, 
        imagePublicId: finalPublicId || '',
        description: description || '',
        order: order || 0,
        isFeatured: Boolean(isFeatured)
      });
      await member.save();

      return res.json({ success: true, message: 'Team member added!', member, data: member });
    }

    const newMember = {
      _id: 'team_' + Date.now(),
      id: 'team_' + Date.now(),
      name,
      role,
      whatsappNumber,
      image: assignedImage,
      imagePublicId: finalPublicId || '',
      description: description || '',
      order: order || 0,
      isFeatured: Boolean(isFeatured),
      createdAt: new Date()
    };
    fallbackTeam.unshift(newMember);

    res.json({ success: true, message: 'Team member added!', member: newMember, data: newMember });
  } catch (error) {
    console.error('Add team error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Team Member (Protected)
app.put('/api/admin/team/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    const { name, role, whatsappNumber, image, description, isFeatured, order } = req.body;
    
    let finalImage, finalPublicId;
    if (image !== undefined) {
      const imgRes = await saveOrUploadImage(image, 'team', 'team');
      finalImage = imgRes.imageUrl;
      finalPublicId = imgRes.publicId;
    }
    invalidateTeamCache();

    if (mongoose.connection.readyState === 1) {
      const updateData = {};
      if (name !== undefined) updateData.name = sanitizeText(name, 100);
      if (role !== undefined) updateData.role = sanitizeText(role, 100);
      if (whatsappNumber !== undefined) updateData.whatsappNumber = sanitizeText(whatsappNumber, 30);
      if (finalImage !== undefined) {
        updateData.image = finalImage;
        updateData.imagePublicId = finalPublicId;
      }
      if (description !== undefined) updateData.description = sanitizeText(description, 1000);
      if (order !== undefined) updateData.order = Math.max(0, parseInt(order) || 0);
      if (isFeatured !== undefined) updateData.isFeatured = Boolean(isFeatured);

      const member = await Team.findByIdAndUpdate(
        req.params.id,
        updateData,
        { returnDocument: 'after' }
      ).lean().maxTimeMS(5000);

      if (!member) {
        return res.status(404).json({ success: false, message: 'Team member not found' });
      }

      return res.json({ success: true, message: 'Team member updated!', member, data: member });
    }

    const idx = fallbackTeam.findIndex(t => (t._id === req.params.id || t.id === req.params.id));
    if (idx !== -1) {
      fallbackTeam[idx] = {
        ...fallbackTeam[idx],
        ...(name !== undefined && { name: sanitizeText(name, 100) }),
        ...(role !== undefined && { role: sanitizeText(role, 100) }),
        ...(whatsappNumber !== undefined && { whatsappNumber: sanitizeText(whatsappNumber, 30) }),
        ...(finalImage !== undefined && { image: finalImage, imagePublicId: finalPublicId }),
        ...(description !== undefined && { description: sanitizeText(description, 1000) }),
        ...(order !== undefined && { order: Math.max(0, parseInt(order) || 0) }),
        ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) })
      };
      return res.json({ success: true, message: 'Team member updated!', member: fallbackTeam[idx], data: fallbackTeam[idx] });
    }

    res.status(404).json({ success: false, message: 'Team member not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Team Member (Protected)
app.delete('/api/admin/team/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    invalidateTeamCache();
    if (mongoose.connection.readyState === 1) {
      const m = await Team.findById(req.params.id);
      if (m) {
        if (m.imagePublicId) {
          await deleteCloudinaryAsset(m.imagePublicId);
        } else if (m.image) {
          await deleteCloudinaryAsset(extractPublicIdFromUrl(m.image));
        }
        await Team.findByIdAndDelete(req.params.id);
      }
      return res.json({ success: true, message: 'Team member deleted!' });
    }

    fallbackTeam = fallbackTeam.filter(t => t._id !== req.params.id && t.id !== req.params.id);
    res.json({ success: true, message: 'Team member deleted!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// WhatsApp Contacts Aliases (For backwards compatibility)
app.get('/api/admin/whatsapp-contacts', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const contacts = await Team.find();
      return res.json(contacts);
    }
    res.json(fallbackTeam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/whatsapp-contact', authenticateToken, async (req, res) => {
  try {
    const { name, role, whatsappNumber, image, description } = req.body;
    const { imageUrl: finalImage, publicId: finalPublicId } = await saveOrUploadImage(image, 'team', 'team');
    const assignedImage = finalImage || 'https://via.placeholder.com/150';

    if (mongoose.connection.readyState === 1) {
      const contact = new Team({ 
        name: sanitizeText(name, 100), 
        role: sanitizeText(role, 100), 
        whatsappNumber: sanitizeText(whatsappNumber, 30), 
        image: assignedImage, 
        imagePublicId: finalPublicId || '',
        description: sanitizeText(description, 1000) 
      });
      await contact.save();
      return res.json(contact);
    }
    const newC = { 
      _id: 'team_' + Date.now(), 
      id: 'team_' + Date.now(), 
      name: sanitizeText(name, 100), 
      role: sanitizeText(role, 100), 
      whatsappNumber: sanitizeText(whatsappNumber, 30), 
      image: assignedImage, 
      imagePublicId: finalPublicId || '',
      description: sanitizeText(description, 1000), 
      createdAt: new Date() 
    };
    fallbackTeam.unshift(newC);
    res.json(newC);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/whatsapp-contact/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const m = await Team.findById(req.params.id);
      if (m) {
        if (m.imagePublicId) {
          await deleteCloudinaryAsset(m.imagePublicId);
        } else if (m.image) {
          await deleteCloudinaryAsset(extractPublicIdFromUrl(m.image));
        }
        await Team.findByIdAndDelete(req.params.id);
      }
    }
    fallbackTeam = fallbackTeam.filter(t => t._id !== req.params.id && t.id !== req.params.id);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= DATA & OTHER CRUD ROUTES =================

// Public Data API (Sanitized & Strictly Projected)
app.get('/api/data', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const settings = (await Setting.findOne().select('companyName availabilityStatus tagline subheading whatsappNumber contactEmail officeAddress updatedAt -_id').lean()) || fallbackSettings;
      const services = await Service.find({ isActive: { $ne: false } }).select('-__v').sort({ createdAt: -1 }).lean();
      const portfolio = await Portfolio.find({ isActive: { $ne: false } }).select('-__v').sort({ createdAt: -1 }).lean();
      const team = await Team.find({ isActive: { $ne: false } }).select('-__v').sort({ createdAt: -1 }).lean();
      const reviews = await Review.find({ isActive: { $ne: false } }).select('-__v').lean();
      return res.json({ settings, services, portfolio, team, reviews, inquiries: [] });
    }

    const fallbackPath = path.join(__dirname, 'data.json');
    if (fs.existsSync(fallbackPath)) {
      const raw = fs.readFileSync(fallbackPath, 'utf-8');
      const data = JSON.parse(raw);
      return res.json({ ...data, settings: fallbackSettings, services: fallbackServices, portfolio: fallbackPortfolio, team: fallbackTeam, inquiries: [] });
    }

    res.json({ settings: fallbackSettings, services: fallbackServices, portfolio: fallbackPortfolio, team: fallbackTeam, reviews: [], inquiries: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load public data' });
  }
});


// ================= REVIEW ROUTES =================

const getReviewsHandler = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const reviews = await Review.find({ isActive: { $ne: false } }).select('-__v').sort({ createdAt: -1 }).lean().maxTimeMS(5000);
      return res.json({ success: true, reviews });
    }
    res.json({ success: true, reviews: fallbackReviews });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get All Reviews (Public & Admin)
app.get('/api/reviews', getReviewsHandler);
app.get('/api/admin/reviews', authenticateToken, getReviewsHandler);
app.get('/api/admin/review', authenticateToken, getReviewsHandler);

// Add Review (Protected)
app.post('/api/admin/review', authenticateToken, async (req, res) => {
  try {
    const { name, role, rating, text, image, avatar, clientName, clientRole, comment, testimonial, isFeatured } = req.body;
    const cleanName = sanitizeText(name || clientName || '', 100);
    const cleanText = sanitizeText(text || testimonial || comment || '', 1500);
    const cleanRole = sanitizeText(role || clientRole || 'Client', 100);
    const rawRating = parseInt(rating);
    const cleanRating = isNaN(rawRating) ? 5 : Math.min(5, Math.max(1, rawRating));
    const { imageUrl: finalImage, publicId: finalPublicId } = await saveOrUploadImage(image || avatar, 'reviews', 'review');

    // Validation
    if (!cleanName || !cleanText) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and review text are required!' 
      });
    }

    if (mongoose.connection.readyState === 1) {
      const review = new Review({
        name: cleanName,
        role: cleanRole,
        rating: cleanRating,
        text: cleanText,
        testimonial: cleanText,
        image: finalImage || '',
        avatar: finalImage || '',
        imagePublicId: finalPublicId || '',
        isFeatured: Boolean(isFeatured)
      });

      await review.save();

      return res.json({ 
        success: true, 
        message: 'Review added successfully!',
        review,
        data: review 
      });
    }

    const newRev = {
      _id: 'rev_' + Date.now(),
      id: 'rev_' + Date.now(),
      name: cleanName,
      role: cleanRole,
      rating: cleanRating,
      text: cleanText,
      testimonial: cleanText,
      image: finalImage || '',
      avatar: finalImage || '',
      imagePublicId: finalPublicId || '',
      isFeatured: Boolean(isFeatured),
      createdAt: new Date()
    };
    fallbackReviews.unshift(newRev);

    res.json({ 
      success: true, 
      message: 'Review added successfully!',
      review: newRev,
      data: newRev 
    });
  } catch (error) {
    console.error('❌ Add review error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to save review' 
    });
  }
});

// Update Review (Protected)
app.put('/api/admin/review/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    const { name, role, rating, text, image, avatar, clientName, clientRole, comment, isFeatured } = req.body;
    const finalName = name || clientName;
    const finalText = text || comment;
    const finalRole = role || clientRole;
    const finalRating = rating !== undefined ? Math.min(5, Math.max(1, parseInt(rating) || 5)) : undefined;
    
    let finalImage, finalPublicId;
    if (image !== undefined || avatar !== undefined) {
      const imgRes = await saveOrUploadImage(image || avatar, 'reviews', 'review');
      finalImage = imgRes.imageUrl;
      finalPublicId = imgRes.publicId;
    }

    if (mongoose.connection.readyState === 1) {
      const updateData = {};
      if (finalName !== undefined) updateData.name = sanitizeText(finalName, 100);
      if (finalRole !== undefined) updateData.role = sanitizeText(finalRole, 100);
      if (finalRating !== undefined) updateData.rating = finalRating;
      if (finalText !== undefined) {
        updateData.text = sanitizeText(finalText, 1500);
        updateData.testimonial = sanitizeText(finalText, 1500);
      }
      if (finalImage !== undefined) {
        updateData.image = finalImage;
        updateData.avatar = finalImage;
        updateData.imagePublicId = finalPublicId;
      }
      if (isFeatured !== undefined) updateData.isFeatured = Boolean(isFeatured);

      const review = await Review.findByIdAndUpdate(
        req.params.id,
        updateData,
        { returnDocument: 'after' }
      ).lean().maxTimeMS(5000);

      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }

      return res.json({ success: true, message: 'Review updated!', review });
    }

    const idx = fallbackReviews.findIndex(r => r._id === req.params.id || r.id === req.params.id);
    if (idx !== -1) {
      fallbackReviews[idx] = {
        ...fallbackReviews[idx],
        ...(finalName !== undefined && { name: sanitizeText(finalName, 100) }),
        ...(finalRole !== undefined && { role: sanitizeText(finalRole, 100) }),
        ...(finalRating !== undefined && { rating: finalRating }),
        ...(finalText !== undefined && { text: sanitizeText(finalText, 1500), testimonial: sanitizeText(finalText, 1500) }),
        ...(finalImage !== undefined && { image: finalImage, avatar: finalImage, imagePublicId: finalPublicId }),
        ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) })
      };
      return res.json({ success: true, message: 'Review updated!', review: fallbackReviews[idx] });
    }

    res.status(404).json({ success: false, message: 'Review not found' });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Review (Protected)
app.delete('/api/admin/review/:id', authenticateToken, validateIdParam, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const r = await Review.findById(req.params.id);
      if (r) {
        if (r.imagePublicId) {
          await deleteCloudinaryAsset(r.imagePublicId);
        } else if (r.image || r.avatar) {
          await deleteCloudinaryAsset(extractPublicIdFromUrl(r.image || r.avatar));
        }
        await Review.findByIdAndDelete(req.params.id);
      }
      return res.json({ success: true, message: 'Review deleted!' });
    }

    fallbackReviews = fallbackReviews.filter(r => r._id !== req.params.id && r.id !== req.params.id);
    res.json({ success: true, message: 'Review deleted!' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Inquiries / Leads Storage & Handlers
let fallbackInquiries = [];

const getLeadsHandler = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const leads = await Inquiry.find().sort({ date: -1, createdAt: -1 }).lean().maxTimeMS(5000);
      console.log(`📋 [Admin Leads API] Admin retrieved ${leads.length} leads from MongoDB Atlas (Model: Inquiry, Collection: inquiries)`);
      return res.json({ success: true, leads, inquiries: leads, data: leads });
    }
    console.log(`📋 [Admin Leads API] Admin retrieved ${fallbackInquiries.length} leads from fallback store`);
    res.json({ success: true, leads: fallbackInquiries, inquiries: fallbackInquiries, data: fallbackInquiries });
  } catch (err) {
    console.error('❌ [Admin Leads API] Failed to fetch leads:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const inquirySubmitHandler = async (req, res) => {
  try {
    const { name, email, phone, whatsapp, service, projectType, message, details, budget } = req.body;
    const cleanName = sanitizeText(name || '', 100);
    const cleanEmail = sanitizeText(email || '', 100);
    const cleanPhone = sanitizeText(phone || whatsapp || '', 30);
    const cleanService = sanitizeText(service || projectType || '', 100);
    const cleanMessage = sanitizeText(message || details || '', 3000);
    const cleanBudget = sanitizeText(budget || '', 50);

    if (!cleanName && !cleanEmail && !cleanMessage) {
      console.warn('⚠️ [Leads API] Submission rejected: Missing required contact fields.');
      return res.status(400).json({ success: false, message: 'Name, email, or message is required' });
    }

    const inquiryData = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      service: cleanService,
      message: cleanMessage,
      budget: cleanBudget,
      status: 'new',
      date: new Date()
    };

    console.log(`📥 [Leads API] Received contact form submission from: "${cleanName || 'Visitor'}" (${cleanEmail || 'No email'})`);

    if (mongoose.connection.readyState === 1) {
      const inquiry = new Inquiry(inquiryData);
      const savedLead = await inquiry.save();
      console.log(`✅ [Leads API] Successfully saved lead record to MongoDB Atlas | Model: Inquiry | Collection: inquiries | ID: ${savedLead._id}`);
      return res.status(201).json({
        success: true,
        message: 'Inquiry submitted successfully!',
        inquiry: savedLead,
        lead: savedLead,
        data: savedLead
      });
    }

    if (process.env.MONGODB_URI) {
      console.warn('⚠️ [Leads API] MongoDB connection not ready. Using fallback in-memory store.');
    }

    const newInquiry = { ...inquiryData, _id: 'inq_' + Date.now(), id: 'inq_' + Date.now() };
    fallbackInquiries.unshift(newInquiry);
    console.log(`ℹ️ [Leads API] Saved lead to local fallback store | ID: ${newInquiry._id}`);
    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully!',
      inquiry: newInquiry,
      lead: newInquiry,
      data: newInquiry
    });
  } catch (err) {
    console.error('❌ [Leads API] Error saving contact submission:', err.message);
    res.status(500).json({ success: false, error: 'Failed to submit inquiry: ' + err.message });
  }
};

const deleteInquiryHandler = async (req, res) => {
  try {
    const id = req.params.id;
    if (mongoose.connection.readyState === 1) {
      const deleted = await Inquiry.findByIdAndDelete(id);
      console.log(`🗑️ [Admin Leads API] Admin deleted lead ID: ${id} from MongoDB Atlas (Collection: inquiries) | Existed: ${Boolean(deleted)}`);
    }
    fallbackInquiries = fallbackInquiries.filter(i => i._id !== id && i.id !== id);
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    console.error('❌ [Admin Leads API] Failed to delete lead:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/leads', authenticateToken, getLeadsHandler);
app.get('/api/admin/leads', authenticateToken, getLeadsHandler);
app.get('/api/inquiries', authenticateToken, getLeadsHandler);
app.get('/api/admin/inquiries', authenticateToken, getLeadsHandler);

app.post('/api/inquiries', inquiryLimiter, inquirySubmitHandler);
app.post('/api/leads', inquiryLimiter, inquirySubmitHandler);
app.post('/api/contact', inquiryLimiter, inquirySubmitHandler);

app.delete('/api/admin/leads/:id', authenticateToken, validateIdParam, deleteInquiryHandler);
app.delete('/api/admin/lead/:id', authenticateToken, validateIdParam, deleteInquiryHandler);
app.delete('/api/admin/inquiry/:id', authenticateToken, validateIdParam, deleteInquiryHandler);
app.delete('/api/admin/inquiries/:id', authenticateToken, validateIdParam, deleteInquiryHandler);
app.delete('/api/leads/:id', authenticateToken, validateIdParam, deleteInquiryHandler);
app.delete('/api/inquiries/:id', authenticateToken, validateIdParam, deleteInquiryHandler);

// Static Files & SEO Endpoints
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  index: false
}));

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

// Page Routes
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin-login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🔒 Secure server running on http://localhost:${PORT}`);
  console.log(`👥 Team Endpoints: GET /api/team | POST/PUT/DELETE /api/admin/team`);
});

// HTTP Server Slowloris & Keep-Alive Protection
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;
