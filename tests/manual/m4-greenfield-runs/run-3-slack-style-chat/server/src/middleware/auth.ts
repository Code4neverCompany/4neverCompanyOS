import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
      });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    (req as AuthRequest).userId = payload.sub;
    next();
  } catch {
    res
      .status(401)
      .json({ error: { code: "TOKEN_INVALID", message: "Invalid or expired access token" } });
  }
}
