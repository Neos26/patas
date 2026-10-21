import { z } from 'zod';

export const generateQuizSchema = z
  .object({
    title: z.string().trim().min(3, 'Title is too short').max(120),
    subject: z.string().trim().max(120).optional(),
    topic: z.string().trim().min(2, 'Topic is required').max(200),
    objectives: z
      .array(z.string().trim().min(3).max(300))
      .min(1, 'Add at least one learning objective')
      .max(6),
    material: z.string().max(60000).optional(),
    count: z.number().int().min(4, 'Minimum 4 questions').max(30),
    difficulty: z.object({
      easy: z.number().int().min(0).max(30),
      medium: z.number().int().min(0).max(30),
      hard: z.number().int().min(0).max(30),
    }),
    types: z
      .array(z.enum(['mcq', 'true_false', 'identification', 'short_answer']))
      .min(1, 'Pick at least one question type'),
    timeLimitMin: z.number().int().min(3).max(180).default(20),
  })
  .superRefine((val, ctx) => {
    const sum = val.difficulty.easy + val.difficulty.medium + val.difficulty.hard;
    if (sum !== val.count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['difficulty'],
        message: `Difficulty split (${sum}) must equal the number of questions (${val.count}).`,
      });
    }
    if (sum === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['difficulty'],
        message: 'At least one question is required.',
      });
    }
  });

export const publishSchema = z.object({
  hours: z.number().int().min(1).max(168).default(24),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['teacher', 'student'], {
    errorMap: () => ({ message: 'Choose teacher or student.' }),
  }),
});

/** Firebase mode: the Auth account already exists; only profile data is sent. */
export const registerClaimsSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  role: z.enum(['teacher', 'student'], {
    errorMap: () => ({ message: 'Choose teacher or student.' }),
  }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  password: z.string().min(1, 'Password is required').max(128),
});

export const answerSchema = z.object({
  qi: z.number().int().min(0).max(500),
  v: z.union([z.string().max(1000), z.number().int().min(0).max(50)]),
  t: z.number().int().min(0).max(6 * 60 * 60 * 1000).optional(),
});

export const eventSchema = z.object({
  type: z.enum([
    'blur',
    'focus',
    'fullscreen_exit',
    'paste',
    'copy',
    'cut',
    'devtools',
  ]),
});

export const submitSchema = z.object({
  auto: z.boolean().default(false),
});

export const flagReviewSchema = z.object({
  status: z.enum(['open', 'confirmed', 'dismissed']),
});
