"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function JudgeView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);
  const [activeScore, setActiveScore] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    
    socket.emit("request_system_state");

    socket.on("state_changed", (newState) => {
      setSystemState(newState);
      // Reset score if participant changed
      if (newState.status !== "pasada_activa") {
        setActiveScore(null);
      }
    });

    return () => {
      socket.off("state_changed");
    };
  }, [socket]);

  const handleScore = (val: number) => {
    if (!socket || systemState?.status !== "pasada_activa") return;
    setActiveScore(val);
    socket.emit("submit_score", { score: val });
  };

  const handleFinish = () => {
    if (!socket) return;
    socket.emit("judge_consensus_ready");
  };

  const isVotingEnabled = systemState?.status === "pasada_activa";

  return (
    <div className="flex-1 flex flex-col p-4 bg-background min-h-screen">
      <header className="flex justify-between items-center mb-8 border-b border-border pb-4">
        <h1 className="text-xl font-bold uppercase text-white">PANEL DE JUEZ</h1>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
          {connected ? "CONNECTADO" : "SIN CONEXIÓN"}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full gap-8">
        {/* Participant Info */}
        <div className="bg-surface p-6 rounded-2xl border border-border text-center">
          <p className="text-gray-400 font-bold mb-2 uppercase text-sm tracking-widest">Puntuando a:</p>
          <h2 className="text-4xl font-black italic text-white uppercase break-all">
            {systemState?.activeParticipantName || "ESPERANDO..."}
          </h2>
        </div>

        {/* Arcade Buttons Wrapper */}
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((val) => (
            <motion.button
              key={val}
              whileTap={isVotingEnabled ? { scale: 0.9 } : {}}
              disabled={!isVotingEnabled}
              onClick={() => handleScore(val)}
              className={`
                aspect-square rounded-2xl text-4xl font-black flex items-center justify-center
                transition-all duration-200 border-b-8 
                ${!isVotingEnabled ? 'bg-gray-800 text-gray-600 border-gray-900 cursor-not-allowed opacity-50' : 
                  activeScore === val 
                    ? 'bg-white text-black border-gray-400 translate-y-2 border-b-0' 
                    : 'bg-surface text-primary border-primary hover:bg-primary hover:text-white'}
              `}
            >
              {val}
            </motion.button>
          ))}
        </div>

        {/* Consense Button */}
        <button 
          disabled={!isVotingEnabled}
          onClick={handleFinish}
          className={`mt-4 w-full py-6 rounded-2xl font-black text-2xl uppercase tracking-widest transition-all ${
            !isVotingEnabled ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-hover active:scale-95'
          }`}
        >
          Terminar Pasada
        </button>
      </main>
    </div>
  );
}
