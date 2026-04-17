"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Uses Next.js environment variables. Blank string forces relative host resolving in browser
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "";
    const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH || "/rnh/socket.io/";

    const socketInstance = io(socketUrl, {
      path: socketPath,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });

    socketInstance.on("connect", () => {
      setConnected(true);
      console.log("Connected to WebSocket Server");
    });

    socketInstance.on("disconnect", () => {
      setConnected(false);
      console.log("Disconnected from WebSocket Server");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
