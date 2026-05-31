import React, { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSocket } from "../context/SocketContext.js";

interface MessageInputProps {
  channelId: string;
}

export function MessageInput({ channelId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const socket = useSocket();

  const send = () => {
    if (!content.trim() || !socket) return;
    socket.emit("message:send", { channelId, content: content.trim() });
    setContent("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message #${channelId}`}
        rows={1}
      />
      <button type="submit">Send</button>
    </form>
  );
}
