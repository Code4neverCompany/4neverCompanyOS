import { Router } from "express";
import { query } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const rows = await query(
    `SELECT DISTINCT ON (dm.id)
            dm.id, dm.content, dm.created_at, dm.is_deleted,
            CASE WHEN dm.sender_id = $1 THEN dm.recipient_id ELSE dm.sender_id END as other_user_id,
            u.name as other_user_name, u.avatar_url as other_user_avatar
     FROM direct_messages dm
     JOIN users u ON u.id = CASE WHEN dm.sender_id = $1 THEN dm.recipient_id ELSE dm.sender_id END
     WHERE dm.sender_id = $1 OR dm.recipient_id = $1
     ORDER BY dm.id, dm.created_at DESC`,
    [req.userId],
  );
  res.json({ data: rows });
});

router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  const rows = await query(
    `SELECT dm.id, dm.content, dm.created_at, dm.is_deleted,
            dm.sender_id, dm.recipient_id
     FROM direct_messages dm
     WHERE (dm.sender_id = $1 AND dm.recipient_id = $2)
        OR (dm.sender_id = $2 AND dm.recipient_id = $1)
     ORDER BY dm.created_at ASC`,
    [req.userId, userId],
  );
  res.json({ data: rows });
});

router.post("/", async (req, res) => {
  const { recipientId, content } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Content required" } });
    return;
  }
  const dm = await query(
    "INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *",
    [req.userId, recipientId, content.trim()],
  );
  res.status(201).json({ data: dm.rows[0] });
});

export { router as dmsRouter };
