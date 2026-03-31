import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { AppError } from '../errors/AppError';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const catalogUploadsDir = path.join(uploadsRoot, 'catalog');
const avatarsUploadsDir = path.join(uploadsRoot, 'avatars');

fs.mkdirSync(catalogUploadsDir, { recursive: true });
fs.mkdirSync(avatarsUploadsDir, { recursive: true });

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const createImageUpload = (destination: string) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, destination);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${Date.now()}-${randomUUID()}${ext}`);
      },
    }),
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

export const catalogImageUpload = createImageUpload(catalogUploadsDir);
export const avatarImageUpload = createImageUpload(avatarsUploadsDir);

export const buildUploadedFileUrl = (filename: string): string => `/uploads/catalog/${filename}`;
export const buildUploadedAvatarUrl = (filename: string): string => `/uploads/avatars/${filename}`;
