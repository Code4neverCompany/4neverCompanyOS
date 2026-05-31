import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext.js";

interface Message {
  id: string;
  channel_id: string;
  content: string;
  created_at: string;
  user: { id: string; name: string; avatar_url?: string };
}

interface MessageListProps {
  channelId: string;
}

export function MessageList({ channelId }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    loadMessages();
  }, [channelId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("channel:join", { channelId });
    const handler = (msg: Message) => {
      if (msg.channel_id === channelId) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on("message:new", handler);
    return () => {
      socket.emit("channel:leave", { channelId });
      socket.off("message:new", handler);
    };
  }, [socket, channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    // Pagination loading — implementation here
  };

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} className="message">
          <img src={msg.user.avatar_url ?? "/default-avatar.png"} alt="" className="avatar" />
          <div className="message-body">
            <span className="username">{msg.user.name}</span>
            <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString()}</span>
            <p>{msg.content}</p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
