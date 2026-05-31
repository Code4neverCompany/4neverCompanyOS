import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { channelsRouter } from "./routes/channels.js";
import { messagesRouter } from "./routes/messages.js";
import { filesRouter } from "./routes/files.js";
import { searchRouter } from "./routes/search.js";
import { presenceRouter } from "./routes/presence.js";
import { dmsRouter } from "./routes/dms.js";
import { setupSocketHandlers } from "./socket/handlers.js";

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  },
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/files", filesRouter);
app.use("/api/search", searchRouter);
app.use("/api/presence", presenceRouter);
app.use("/api/dms", dmsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});

export { io };
