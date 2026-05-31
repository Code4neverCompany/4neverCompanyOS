import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth.js";
import { query } from "../db/client.js";

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.diskStorage({
    destination: path.resolve("uploads"),
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/channels/:channelId/files", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: { code: "NO_FILE", message: "No file uploaded" } });
    return;
  }
  const { channelId } = req.params;
  const member = await query(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    [channelId, req.userId],
  );
  if (!member.rows.length) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Not a member" } });
    return;
  }
  const fileRecord = await query(
    `INSERT INTO files (message_id, user_id, filename, original_name, mime_type, size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [null, req.userId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size],
  );
  res.status(201).json({ data: fileRecord.rows[0] });
});

router.get("/:fileId", async (req, res) => {
  const file = await query("SELECT * FROM files WHERE id = $1", [req.params.fileId]);
  if (!file.rows.length) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found" } });
    return;
  }
  const { filename, original_name, mime_type } = file.rows[0];
  res.setHeader("Content-Disposition", `attachment; filename="${original_name}"`);
  res.setHeader("Content-Type", mime_type || "application/octet-stream");
  res.sendFile(path.resolve("uploads", filename));
});

export { router as filesRouter };
