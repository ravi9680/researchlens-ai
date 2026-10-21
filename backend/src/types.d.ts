import "express";

/* Type augmentation: routes attach the decoded JWT to `req.user`.
 * Declaring it once removes the `(req as any).user` casts scattered around
 * the route handlers. */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        typ?: string;
        iat?: number;
        exp?: number;
      };
      requestId?: string;
      startedAt?: number;
    }
  }
}

export {};
