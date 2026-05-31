import { Router } from "express";
import { query, queryOne } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/channels/:channelId/messages", async (req, res) => {
  const { channelId } = req.params;
  const { before, limit = 50 } = req.query;
  const member = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [channelId, req.userId]
  );
  if (!member) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member" } });
    return;
  }
  const params: unknown[] = [channelId];
  let whereClause = "WHERE channel_id = $1 AND parent_id IS NULL AND is_deleted = FALSE";
  if (before) {
    params.push(before);
    whereClause += ` AND created_at < $${params.length}`;
  }
  params.push(Number(limit));
  const rows = await query(
    `SELECT m.id, m.content, m.created_at, m.updated_at, m.is_deleted,
            u.id as user_id, u.name as user_name, u.avatar_url as user_avatar
     FROM messages m
     JOIN users u ON u.id = m.user_id
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  res.json({ data: rows.reverse() });
});

router.post("/channels/:channelId/messages", async (req, res) => {
  const { channelId } = req.params;
  const { content } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Message content required" } });
    return;
  }
  const member = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [channelId, req.userId]
  );
  if (!member) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member" } });
    return;
  }
  const message = await queryOne(
    `INSERT INTO messages (channel_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, channel_id, content, created_at, updated_at, is_deleted`,
    [channelId, req.userId, content.trim()]
  );
  const user = await queryOne("SELECT name, avatar_url FROM users WHERE id = $1", [req.userId]);
  const result = { ...message, user: { id: req.userId, name: user!.name, avatar_url: user!.avatar_url } };
  res.status(201).json({ data: result });
});

router.patch("/:messageId", async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const message = await queryOne("SELECT user_id FROM messages WHERE id = $1", [messageId]);
  if (!message) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Message not found" } });
    return;
  }
  if (message.user_id !== req.userId) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Can only edit your own messages" } });
    return;
  }
  const updated = await queryOne(
    "UPDATE messages SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [content, messageId]
  );
  res.json({ data: updated });
});

router.delete("/:messageId", async (req, res) => {
  const { messageId } = req.params;
  const message = await queryOne("SELECT user_id FROM messages WHERE id = $1", [messageId]);
  if (!message) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Message not found" } });
    return;
  }
  if (message.user_id !== req.userId) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Can only delete your own messages" } });
    return;
  }
  await query("UPDATE messages SET is_deleted = TRUE WHERE id = $1", [messageId]);
  res.json({ message: "Message deleted" });
});

router.get("/:messageId/thread", async (req, res) => {
  const { messageId } = req.params;
  const rows = await query(
    `SELECT m.id, m.content, m.created_at, m.is_deleted,
            u.id as user_id, u.name as user_name, u.avatar_url as user_avatar
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.parent_id = $1
     ORDER BY m.created_at ASC`,
    [messageId]
  );
  res.json({ data: rows });
});

router.post("/:messageId/reply", async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const parent = await queryOne<{ channel_id: string }>("SELECT channel_id FROM messages WHERE id = $1", [messageId]);
  if (!parent) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Parent message not found" } });
    return;
  }
  const member = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [parent.channel_id, req.userId]
  );
  if (!member) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member" } });
    return;
  }
  const message = await queryOne(
    "INSERT INTO messages (channel_id, user_id, parent_id, content) VALUES ($1, $2, $3, $4) RETURNING *",
    [parent.channel_id, req.userId, messageId, content]
  );
  res.status(201).json({ data: message });
});

router.post("/:messageId/reactions", async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  try {
    const reaction = await queryOne(
      "INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) RETURNING *",
      [messageId, req.userId, emoji]
    );
    res.status(201).json({ data: reaction });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: { code: "ALREADY_REACTED", message: "Already reacted with this emoji" } });
      return;
    }
    throw err;
  }
});

router.delete("/:messageId/reactions/:emoji", async (req, res) => {
  const { messageId, emoji } = req.params;
  await query(
    "DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
    [messageId, req.userId, emoji]
  );
  res.json({ message: "Reaction removed" });
});

export { router as messagesRouter };
