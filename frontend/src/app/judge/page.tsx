"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function JudgeView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);
  const [activeScore, setActiveScore] = useState<number | null>(null);
  
  // Auth state
  const [judge, setJudge] = useState<any>(null);
  const [pinInput, setPinInput] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    // Optionally restore judge from local storage if needed on reload
    const storedJudge = localStorage.getItem("rnh_judge");
    if (storedJudge) setJudge(JSON.parse(storedJudge));
  }, []);

  useEffect(() => {
    if (!socket || !judge) return;
    
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
  }, [socket, judge]);

  const handleLogin = async () => {
    if (!pinInput) return;
    setLoadingConfig(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/rnh/api";
      const res = await fetch(`${apiUrl}/judges/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });
      const data = await res.json();
      if (res.ok) {
        setJudge(data);
        localStorage.setItem("rnh_judge", JSON.stringify(data));
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Error al conectar con el servidor.");
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleScore = (val: number) => {
    if (!socket || systemState?.status !== "pasada_activa" || !judge) return;
    setActiveScore(val);
    
    // We send judgeId, and if DB model requires participantId we should have it in system state
    // But for MVP, the server handles mapping via active state
    socket.emit("submit_score", { score: val, judgeId: judge.id });
  };

  const handleFinish = () => {
    if (!socket || !judge) return;
    socket.emit("judge_consensus_ready", { judgeId: judge.id });
  };

  // -----------------------------------
  // VISTA LOGIN
  // -----------------------------------
  if (!judge) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background min-h-screen">
        <div className="w-full max-w-sm bg-surface p-8 rounded-2xl border border-border text-center">
          <h2 className="text-2xl font-black text-white mb-2 uppercase">Identificación</h2>
          <p className="text-gray-400 mb-8 text-sm">Ingresa tu código PIN de Juez</p>
          
          <input 
            type="number" 
            placeholder="****"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl p-4 text-center text-4xl text-white font-black tracking-[1em] focus:border-primary focus:outline-none mb-6"
            maxLength={4}
          />
          
          <button 
            onClick={handleLogin}
            disabled={loadingConfig || !pinInput}
            className="w-full bg-primary text-white font-bold p-4 rounded-xl hover:bg-primary-hover disabled:opacity-50"
          >
            {loadingConfig ? "Verificando..." : "Entrar a Calificar"}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------
  // VISTA PRINCIPAL VOTACION
  // -----------------------------------
  const isVotingEnabled = systemState?.status === "pasada_activa";

  return (
    <div className="flex-1 flex flex-col p-4 bg-background min-h-screen">
      <header className="flex justify-between items-center mb-8 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase text-white">PANEL DE JUEZ</h1>
          <p className="text-xs text-primary font-bold">JUEZ ID: {judge.pin} | {judge.name}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
          {connected ? "CONECTADO" : "SIN CONEXIÓN"}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full gap-8">
        {/* Participant Info */}
        <div className="bg-surface p-6 rounded-2xl border border-border text-center">
          <p className="text-gray-400 font-bold mb-2 uppercase text-sm tracking-widest">Puntuando a:</p>
          <h2 className="text-4xl font-black italic text-white uppercase break-all">
            {systemState?.activeParticipantName || "ESPERANDO TURNO..."}
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
                transition-all duration-200 border-b-8 shadow-xl
                ${!isVotingEnabled ? 'bg-gray-800 text-gray-600 border-gray-900 cursor-not-allowed opacity-50' : 
                  activeScore === val 
                    ? 'bg-white text-black border-gray-400 translate-y-2 border-b-0' 
                    : 'bg-surface text-primary border-primary hover:bg-primary-hover hover:text-white'}
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
            !isVotingEnabled ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-hover active:scale-95 shadow-primary-hover/50 shadow-lg'
          }`}
        >
          {activeScore ? 'Guardar Puntuación' : 'Selecciona un score'}
        </button>
      </main>
    </div>
  );
}
