import { Router } from 'express';
import {
  confirmPasswordReset,
  deleteProfile,
  getAllUsers,
  getProfile,
  loginStep1,
  loginStep2,
  passwordLogin,
  promoteUser,
  requestPasswordReset,
  setPassword,
  updateProfile,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';

const router = Router();

router.post('/login/step1', loginStep1);
router.post('/login/step2', loginStep2);
router.post('/login/password', passwordLogin);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.delete('/profile', authenticateToken, deleteProfile);
router.put('/password', authenticateToken, setPassword);
router.post('/password/reset/request', requestPasswordReset);
router.post('/password/reset/confirm', confirmPasswordReset);
router.post('/promote', authenticateToken, checkRole(['admin']), promoteUser);
router.get('/all', authenticateToken, checkRole(['admin']), getAllUsers);

export default router;
