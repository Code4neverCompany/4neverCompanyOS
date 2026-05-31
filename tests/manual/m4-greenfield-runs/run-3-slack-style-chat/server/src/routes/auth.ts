import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query, queryOne } from "../db/client.js";

const router = Router();
const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res
        .status(400)
        .json({
          error: { code: "VALIDATION_ERROR", message: "email, password, and name are required" },
        });
      return;
    }
    const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);
    if (existing) {
      res.status(409).json({ error: { code: "EMAIL_EXISTS", message: "Email already in use" } });
      return;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await queryOne(
      "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, passwordHash, name],
    );
    res.status(201).json({ user, message: "Registration successful" });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Registration failed" } });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await queryOne<{ id: string; email: string; name: string; password_hash: string }>(
      "SELECT id, email, name, password_hash FROM users WHERE email = $1",
      [email],
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res
        .status(401)
        .json({ error: { code: "AUTH_FAILED", message: "Invalid email or password" } });
      return;
    }
    const accessToken = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({
      access_token: accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Login failed" } });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ error: { code: "NO_TOKEN", message: "No refresh token" } });
      return;
    }
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { sub: string };
    const accessToken = signAccess(payload.sub);
    res.json({ access_token: accessToken });
  } catch {
    res
      .status(401)
      .json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired refresh token" } });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("refresh_token");
  res.json({ message: "Logged out" });
});

export { router as authRouter };
