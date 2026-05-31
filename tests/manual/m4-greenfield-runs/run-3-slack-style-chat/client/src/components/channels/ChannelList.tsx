import React, { useEffect, useState } from "react";
import { api } from "../services/api.js";

interface Channel {
  id: string;
  name: string;
  is_private: boolean;
  topic?: string;
  role: string;
}

export function ChannelList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    api.get<{ data: Channel[] }>("/channels").then((res) => setChannels(res.data));
  }, []);

  return (
    <nav className="channel-list">
      <h3>Channels</h3>
      <ul>
        {channels.map((ch) => (
          <li key={ch.id} className={ch.id === selectedId ? "active" : ""}>
            <button onClick={() => onSelect(ch.id)}>
              {ch.is_private ? "🔒" : "#"} {ch.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
