import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function ensureDataLayout(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true });
}

function sanitizeBasename(name) {
  const raw = path.basename(name).replace(/\.[^.]+$/, '');
  const cleaned = raw.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  return cleaned || 'file';
}

function makeFileName(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const base = sanitizeBasename(originalName);
  const shortId = crypto.randomUUID().slice(0, 8);
  return `${Date.now()}-${shortId}-${base}${ext}`;
}

function imageFilter(_req, file, callback) {
  const ext = path.extname(file.originalname).toLowerCase();
  const isImageMime = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/');

  if (isImageMime && ALLOWED_EXTENSIONS.has(ext)) {
    callback(null, true);
    return;
  }

  const error = new Error('Only image files are allowed.');
  error.statusCode = 400;
  callback(error);
}

export function createImageUploader(dataDir, category) {
  const destinationDir = path.join(dataDir, category);

  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, destinationDir);
    },
    filename: (_req, file, callback) => {
      callback(null, makeFileName(file.originalname));
    }
  });

  return multer({ storage, fileFilter: imageFilter }).single('file');
}

export function runUpload(upload, req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      return res.status(error.statusCode || 400).json({ error: error.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Missing file field.' });
    }

    return next();
  });
}

function normalizeStoredPath(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return null;
  }

  return normalized;
}

export function validateStoredPath(input, expectedPrefix) {
  const normalized = normalizeStoredPath(input);
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith(`${expectedPrefix}/`)) {
    return null;
  }

  return normalized;
}

export function deleteStoredFile(dataDir, relativePath) {
  const normalized = normalizeStoredPath(relativePath);
  if (!normalized) {
    return;
  }

  const root = path.resolve(dataDir);
  const absolute = path.resolve(root, normalized);

  if (!absolute.startsWith(`${root}${path.sep}`)) {
    return;
  }

  fs.rmSync(absolute, { force: true });
}
