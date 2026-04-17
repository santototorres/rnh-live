"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LiveView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;
    
    socket.emit("request_system_state");

    socket.on("state_changed", (newState) => {
      setSystemState(newState);
    });

    return () => {
      socket.off("state_changed");
    };
  }, [socket]);

  const isActive = systemState?.status === "pasada_activa";
  const skaterName = systemState?.activeParticipantName || "PREPARANDO...";

  return (
    <div className="flex-1 flex flex-col bg-background min-h-screen overflow-hidden text-center justify-center p-8 relative">
      
      {/* Background Graphic Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-[#0B0B0B] to-[#0B0B0B] z-0"></div>
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-background via-primary to-background opacity-50 z-0"></div>

      <div className="z-10 absolute top-8 right-8">
        <div className={`px-4 py-2 rounded-full text-xs font-bold border ${connected ? 'border-green-500 text-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-red-500 text-red-500 bg-red-500/10'}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      <div className="z-10 absolute top-8 left-8 text-left">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white drop-shadow-md">
          ROLL <span className="text-primary font-bold">NOT</span> HATE
        </h1>
        <p className="text-primary font-mono text-sm tracking-widest mt-1">BROADCAST SYSTEM</p>
      </div>

      <AnimatePresence mode="wait">
        {!isActive ? (
          <motion.div 
            key="standby"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -50 }}
            className="flex flex-col items-center justify-center h-full z-10"
          >
            <motion.div 
              animate={{ opacity: [0.5, 1, 0.5] }} 
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-40 h-40 border-8 border-primary rounded-full flex items-center justify-center mb-12 shadow-[0_0_50px_rgba(255,45,45,0.4)]"
            >
              <span className="font-black text-6xl text-primary drop-shadow-[0_0_10px_rgba(255,45,45,1)]">RNH</span>
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-black uppercase text-white tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,1)]">
              Torneo Oficial
            </h1>
            <p className="mt-8 text-2xl text-gray-300 font-bold uppercase tracking-[0.3em] bg-surface px-10 py-5 rounded-full border-t border-gray-700 shadow-2xl">
              Próximo skater en breve...
            </p>
          </motion.div>
        ) : (
          <motion.div 
            key="active"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="flex flex-col items-center justify-center h-full z-10 relative"
          >
            <div className="absolute w-[150%] h-40 bg-primary/20 -rotate-3 blur-3xl z-[-1] opacity-50"></div>
            
            <div className="inline-block px-8 py-3 bg-primary/20 border-2 border-primary rounded-full mb-12 shadow-[0_0_30px_rgba(255,45,45,0.6)]">
              <span className="text-primary font-black uppercase tracking-[0.4em] flex items-center gap-4 text-2xl">
                <span className="w-4 h-4 bg-primary rounded-full animate-ping"></span>
                EN LA PISTA
              </span>
            </div>
            
            <h1 className="text-[5rem] sm:text-[8rem] lg:text-[12rem] xl:text-[15rem] font-black uppercase text-white tracking-tighter italic -skew-x-[15deg] leading-[0.8] mb-12 drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)] max-w-[95vw] truncate px-10">
              {skaterName}
            </h1>
            
            <div className="flex gap-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "200px" }}
                className="h-3 bg-white skew-x-[15deg] shadow-[0_0_10px_rgba(255,255,255,0.8)]"
              ></motion.div>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "100px" }}
                transition={{ delay: 0.2 }}
                className="h-3 bg-primary skew-x-[15deg] shadow-[0_0_10px_rgba(255,45,45,0.8)]"
              ></motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
