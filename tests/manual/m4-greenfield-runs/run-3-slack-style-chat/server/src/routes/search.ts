import { Router } from "express";
import { query } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { q, channel, user, before, after } = req.query;
  if (!q) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "q parameter required" } });
    return;
  }
  const params: unknown[] = [];
  const conditions: string[] = ["m.is_deleted = FALSE"];
  params.push(q as string);
  conditions.push(`to_tsvector('english', m.content) @@ plainto_tsquery('english', $${params.length})`);
  if (channel) {
    params.push(channel);
    conditions.push(`m.channel_id = $${params.length}`);
  }
  if (user) {
    params.push(user);
    conditions.push(`m.user_id = $${params.length}`);
  }
  if (before) {
    params.push(before);
    conditions.push(`m.created_at < $${params.length}`);
  }
  if (after) {
    params.push(after);
    conditions.push(`m.created_at > $${params.length}`);
  }
  const rows = await query(
    `SELECT m.id, m.content, m.created_at,
            u.id as user_id, u.name as user_name,
            c.id as channel_id, c.name as channel_name
     FROM messages m
     JOIN users u ON u.id = m.user_id
     JOIN channels c ON c.id = m.channel_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', $1)) DESC,
              m.created_at DESC
     LIMIT 20`,
    params
  );
  res.json({ data: rows });
});

export { router as searchRouter };
