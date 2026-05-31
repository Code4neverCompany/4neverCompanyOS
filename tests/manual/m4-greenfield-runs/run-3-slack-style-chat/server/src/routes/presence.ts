import { Router } from "express";
import { query } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.status, u.status_message, u.last_seen_at
     FROM users u ORDER BY u.name`,
  );
  res.json({ data: rows });
});

router.post("/status", async (req, res) => {
  const { status, statusMessage } = req.body;
  await query(
    "UPDATE users SET status = $1, status_message = $2, last_seen_at = NOW() WHERE id = $3",
    [status ?? "online", statusMessage ?? null, req.userId],
  );
  res.json({ message: "Status updated" });
});

export { router as presenceRouter };
