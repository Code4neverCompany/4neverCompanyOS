import { Router } from "express";
import { query, queryOne } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const rows = await query(
    `SELECT c.id, c.name, c.is_private, c.topic, c.is_archived, c.created_at,
            cm.role
     FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id
     WHERE cm.user_id = $1 AND c.is_archived = FALSE
     ORDER BY c.name`,
    [req.userId]
  );
  res.json({ data: rows });
});

router.post("/", async (req, res) => {
  const { name, isPrivate = false, topic } = req.body;
  if (!name || name.length < 2 || name.length > 100) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Channel name must be 2-100 characters" } });
    return;
  }
  try {
    const channel = await queryOne(
      "INSERT INTO channels (name, is_private, topic, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, isPrivate, topic ?? null, req.userId]
    );
    await query(
      "INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, 'admin')",
      [channel!.id, req.userId]
    );
    res.status(201).json({ data: channel });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: { code: "NAME_EXISTS", message: "Channel name already exists" } });
      return;
    }
    throw err;
  }
});

router.get("/:id", async (req, res) => {
  const member = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (!member) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member of this channel" } });
    return;
  }
  const channel = await queryOne("SELECT * FROM channels WHERE id = $1", [req.params.id]);
  if (!channel) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Channel not found" } });
    return;
  }
  res.json({ data: channel });
});

router.patch("/:id", async (req, res) => {
  const admin = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2 AND role = 'admin'",
    [req.params.id, req.userId]
  );
  if (!admin) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Only channel admins can update" } });
    return;
  }
  const { name, topic } = req.body;
  const updated = await queryOne(
    "UPDATE channels SET name = COALESCE($1, name), topic = COALESCE($2, topic) WHERE id = $3 RETURNING *",
    [name, topic, req.params.id]
  );
  res.json({ data: updated });
});

router.delete("/:id", async (req, res) => {
  const admin = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2 AND role = 'admin'",
    [req.params.id, req.userId]
  );
  if (!admin) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Only channel admins can archive" } });
    return;
  }
  await query("UPDATE channels SET is_archived = TRUE WHERE id = $1", [req.params.id]);
  res.json({ message: "Channel archived" });
});

router.post("/:id/join", async (req, res) => {
  const existing = await queryOne(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (existing) {
    res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Already a member" } });
    return;
  }
  await query(
    "INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, 'member')",
    [req.params.id, req.userId]
  );
  res.status(201).json({ message: "Joined channel" });
});

router.post("/:id/leave", async (req, res) => {
  await query(
    "DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  res.json({ message: "Left channel" });
});

export { router as channelsRouter };
