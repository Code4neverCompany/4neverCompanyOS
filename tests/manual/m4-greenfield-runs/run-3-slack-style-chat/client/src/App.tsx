import { useAuth } from "../context/AuthContext.js";
import { LoginForm } from "./components/auth/LoginForm.js";
import { RegisterForm } from "./components/auth/RegisterForm.js";
import { ChannelList } from "./components/channels/ChannelList.js";
import { MessageList } from "./components/messages/MessageList.js";
import { MessageInput } from "./components/messages/MessageInput.js";
import { useState } from "react";

export function App() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  if (!user) {
    return showRegister ? (
      <RegisterForm onSwitch={() => setShowRegister(false)} />
    ) : (
      <LoginForm onSwitch={() => setShowRegister(true)} />
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <ChannelList selectedId={selectedChannel ?? undefined} onSelect={setSelectedChannel} />
      </aside>
      <main className="chat-area">
        {selectedChannel ? (
          <>
            <MessageList channelId={selectedChannel} />
            <MessageInput channelId={selectedChannel} />
          </>
        ) : (
          <div className="no-channel">Select a channel to start chatting</div>
        )}
      </main>
    </div>
  );
}
