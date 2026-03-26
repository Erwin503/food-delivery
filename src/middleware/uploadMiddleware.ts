import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { AppError } from '../errors/AppError';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const catalogUploadsDir = path.join(uploadsRoot, 'catalog');

fs.mkdirSync(catalogUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, catalogUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const catalogImageUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new AppError('Only jpeg, png, webp, and gif images are allowed', 400));
      return;
    }

    cb(null, true);
  },
});

export const buildUploadedFileUrl = (filename: string): string => `/uploads/catalog/${filename}`;
