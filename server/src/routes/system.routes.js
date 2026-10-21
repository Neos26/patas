import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { store } from '../store.js';

export const systemRouter = Router();
systemRouter.use(authenticate);

systemRouter.get('/stats', requireRole('admin'), async (_req, res, next) => {
  try {
    const [users, classes, quizzes, attempts, flags, openFlags] = await Promise.all([
      store.all('users'),
      store.all('classes'),
      store.all('quizzes'),
      store.all('attempts'),
      store.all('integrityFlags'),
      store.all('integrityFlags', { where: [['status', '==', 'open']] }),
    ]);
    res.json({
      users: users.length,
      teachers: users.filter((u) => u.role === 'teacher').length,
      students: users.filter((u) => u.role === 'student').length,
      classes: classes.length,
      quizzes: quizzes.length,
      attempts: attempts.length,
      submitted: attempts.filter((a) => a.status === 'submitted').length,
      flags: flags.length,
      openFlags: openFlags.length,
    });
  } catch (err) {
    next(err);
  }
});
