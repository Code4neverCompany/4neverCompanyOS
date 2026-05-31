import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { query } from "../db/client.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupSocketHandlers(io: SocketIOServer): void {
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.slice(7);
    if (!token) {
      return next(new Error("No token provided"));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`[socket] user ${socket.userId} connected`);

    socket.on("channel:join", async ({ channelId }: { channelId: string }) => {
      const member = await query(
        "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
        [channelId, socket.userId],
      );
      if (member.rows.length) {
        socket.join(`channel:${channelId}`);
      }
    });

    socket.on("channel:leave", ({ channelId }: { channelId: string }) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on(
      "message:send",
      async ({ channelId, content }: { channelId: string; content: string }) => {
        if (!content?.trim()) return;
        const member = await query(
          "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2",
          [channelId, socket.userId],
        );
        if (!member.rows.length) return;
        const result = await query(
          `INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
          [channelId, socket.userId, content.trim()],
        );
        const message = result.rows[0];
        const user = await query("SELECT name, avatar_url FROM users WHERE id = $1", [
          socket.userId,
        ]);
        io.to(`channel:${channelId}`).emit("message:new", {
          ...message,
          user: { id: socket.userId, name: user.rows[0].name, avatar_url: user.rows[0].avatar_url },
        });
      },
    );

    socket.on(
      "message:edit",
      async ({ messageId, content }: { messageId: string; content: string }) => {
        const msg = await query("SELECT user_id, channel_id FROM messages WHERE id = $1", [
          messageId,
        ]);
        if (!msg.rows.length || msg.rows[0].user_id !== socket.userId) return;
        await query("UPDATE messages SET content = $1, updated_at = NOW() WHERE id = $2", [
          content,
          messageId,
        ]);
        io.to(`channel:${msg.rows[0].channel_id}`).emit("message:edited", { messageId, content });
      },
    );

    socket.on("message:delete", async ({ messageId }: { messageId: string }) => {
      const msg = await query("SELECT user_id, channel_id FROM messages WHERE id = $1", [
        messageId,
      ]);
      if (!msg.rows.length || msg.rows[0].user_id !== socket.userId) return;
      await query("UPDATE messages SET is_deleted = TRUE WHERE id = $1", [messageId]);
      io.to(`channel:${msg.rows[0].channel_id}`).emit("message:deleted", { messageId });
    });

    socket.on(
      "reaction:add",
      async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
        try {
          await query("INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)", [
            messageId,
            socket.userId,
            emoji,
          ]);
          const countResult = await query(
            "SELECT COUNT(*) as count FROM reactions WHERE message_id = $1 AND emoji = $2",
            [messageId, emoji],
          );
          io.emit("reaction:added", {
            messageId,
            emoji,
            userId: socket.userId,
            count: Number(countResult.rows[0].count),
          });
        } catch {
          // Already reacted — ignore
        }
      },
    );

    socket.on(
      "reaction:remove",
      async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
        await query("DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3", [
          messageId,
          socket.userId,
          emoji,
        ]);
        const countResult = await query(
          "SELECT COUNT(*) as count FROM reactions WHERE message_id = $1 AND emoji = $2",
          [messageId, emoji],
        );
        io.emit("reaction:removed", {
          messageId,
          emoji,
          userId: socket.userId,
          count: Number(countResult.rows[0].count),
        });
      },
    );

    socket.on(
      "presence:update",
      async ({ status, statusMessage }: { status: string; statusMessage?: string }) => {
        await query(
          "UPDATE users SET status = $1, status_message = $2, last_seen_at = NOW() WHERE id = $3",
          [status, statusMessage ?? null, socket.userId],
        );
        io.emit("presence:changed", { userId: socket.userId, status, statusMessage });
      },
    );

    socket.on("disconnect", () => {
      console.log(`[socket] user ${socket.userId} disconnected`);
    });
  });
}
