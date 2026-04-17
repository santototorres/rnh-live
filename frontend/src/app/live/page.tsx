"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function LiveView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;
    
    // Request initial state on connect
    socket.emit("request_system_state");

    socket.on("state_changed", (newState) => {
      setSystemState(newState);
    });

    return () => {
      socket.off("state_changed");
    };
  }, [socket]);

  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-center relative overflow-hidden bg-background">
      {/* Background Decorator */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary opacity-5 blur-[150px] rounded-full pointer-events-none" />
      
      {/* Header */}
      <header className="absolute top-8 left-8 right-8 flex justify-between items-center z-10">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white drop-shadow-md">
            ROLL <span className="text-primary font-bold">NOT</span> HATE
          </h1>
          <p className="text-gray-400 font-mono text-sm tracking-widest mt-1">LIVE BROADCAST</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${connected ? 'bg-primary' : 'bg-gray-600'}`}></span>
          </span>
          <span className="text-sm font-bold tracking-widest text-[#555] uppercase">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </header>
      
      {/* Main Content Area */}
      <main className="z-10 w-full max-w-4xl mt-20 flex flex-col items-center">
        {!systemState || systemState.status === "setup" ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-4xl text-gray-500 font-bold uppercase tracking-wider mb-2">Evento por comenzar</h2>
            <p className="text-gray-600">Esperando señal de control...</p>
          </motion.div>
        ) : (
          <div className="w-full">
            {/* Active Skater View etc. Will be populated by real state */}
            <div className="bg-surface border border-border p-8 rounded-2xl flex flex-col items-center justify-center shadow-2xl">
              <span className="text-primary font-bold tracking-widest mb-4">SKATER ACTUAL</span>
              <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">
                {systemState.activeParticipantName || "Desconocido"}
              </h2>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
