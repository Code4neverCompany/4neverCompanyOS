import React, { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext.js";

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }
    socketRef.current = io(window.env.VITE_WS_URL || "http://localhost:3001", {
      auth: { token: accessToken },
    });
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [accessToken]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): Socket | null {
  return useContext(SocketContext).socket;
}
