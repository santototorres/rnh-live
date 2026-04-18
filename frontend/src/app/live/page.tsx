"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LiveView() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<any>(null);
  const [pasadaResults, setPasadaResults] = useState<any>(null);
  const [groupResults, setGroupResults] = useState<any>(null);
  const [classification, setClassification] = useState<any>(null);
  const [showResults, setShowResults] = useState<"pasada" | "group" | "classification" | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit("request_state");

    socket.on("state_update", (s) => {
      setState(s);
      if (s.status === "pasada_activa") {
        setShowResults(null);
        setPasadaResults(null);
      }
    });

    socket.on("pasada_results", (d) => {
      setPasadaResults(d);
      setShowResults("pasada");
    });

    socket.on("group_results", (d) => {
      setGroupResults(d);
      setShowResults("group");
    });

    socket.on("round_classification", (d) => {
      setClassification(d);
      setShowResults("classification");
    });

    return () => {
      socket.off("state_update");
      socket.off("pasada_results");
      socket.off("group_results");
      socket.off("round_classification");
    };
  }, [socket]);

  const isActive = state?.status === "pasada_activa" && !showResults;

  return (
    <div className="flex-1 flex flex-col bg-background min-h-screen overflow-hidden text-center justify-center relative">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-[#0B0B0B] to-[#0B0B0B] z-0" />
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-background via-primary to-background opacity-50 z-0" />

      {/* LIVE badge */}
      <div className="z-10 absolute top-6 right-6">
        <div className={`px-4 py-2 rounded-full text-xs font-bold border ${connected ? 'border-green-500 text-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-red-500 text-red-500 bg-red-500/10'}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* Logo */}
      <div className="z-10 absolute top-6 left-6 text-left">
        <img src="/logornh.png" alt="Roll Not Hate" className="h-14 md:h-20 object-contain drop-shadow-lg" />
      </div>

      {/* Status bar */}
      {state?.activeGroupName && (
        <div className="z-10 absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="bg-surface/80 backdrop-blur-sm rounded-full px-6 py-2 flex gap-4 text-sm border border-border">
            <span className="text-primary font-bold">{state.activeCategoryName}</span>
            <span className="text-gray-400">|</span>
            <span className="text-white font-bold">{state.activeGroupName}</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-300">Pasada {state.activePasadaNumber}/{state.totalPasadas}</span>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── STANDBY ── */}
        {!isActive && !showResults && (
          <motion.div key="standby"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -50 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <motion.div animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }} transition={{ repeat: Infinity, duration: 3 }}
              className="mb-8 flex items-center justify-center">
              <img src="/logornh.png" alt="RNH Logo" className="w-48 md:w-64 h-auto object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-black uppercase text-white tracking-widest mt-4">ROLL NOT HATE</h1>
            <p className="mt-6 text-xl text-gray-400 font-bold uppercase tracking-[0.3em]">Próximo roller en breve...</p>
          </motion.div>
        )}

        {/* ── SKATER ACTIVE ── */}
        {isActive && (
          <motion.div key="active"
            initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 1.1 }}
            className="flex flex-col items-center justify-center h-full z-10 relative p-8">
            <div className="absolute w-[150%] h-40 bg-primary/20 -rotate-3 blur-3xl z-[-1] opacity-50" />
            
            <div className="inline-block px-6 py-2 bg-primary/20 border-2 border-primary rounded-full mb-8 shadow-[0_0_30px_rgba(255,45,45,0.6)]">
              <span className="text-primary font-black uppercase tracking-[0.3em] flex items-center gap-3 text-xl">
                <span className="w-3 h-3 bg-primary rounded-full animate-ping" />
                EN LA PISTA
              </span>
            </div>
            
            <h1 className="text-[4rem] sm:text-[6rem] lg:text-[10rem] xl:text-[13rem] font-black uppercase text-white tracking-tighter italic -skew-x-[12deg] leading-[0.85] mb-8 drop-shadow-[0_10px_15px_rgba(0,0,0,0.8)] max-w-[95vw] truncate px-6">
              {state?.activeParticipantName || "..."}
            </h1>
            
            <div className="flex gap-3">
              <motion.div initial={{ width: 0 }} animate={{ width: "180px" }} className="h-2 bg-white skew-x-[12deg] shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              <motion.div initial={{ width: 0 }} animate={{ width: "90px" }} transition={{ delay: 0.2 }} className="h-2 bg-primary skew-x-[12deg] shadow-[0_0_10px_rgba(255,45,45,0.8)]" />
            </div>
          </motion.div>
        )}

        {/* ── PASADA RESULTS ── */}
        {showResults === "pasada" && pasadaResults && (
          <motion.div key="pasada-results"
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <h2 className="text-xl text-gray-400 font-bold uppercase tracking-[0.3em] mb-2">Resultado Pasada {pasadaResults.pasadaNumber}</h2>
            <div className="w-full max-w-lg">
              {pasadaResults.ranking?.map((r: any, i: number) => (
                <motion.div key={r.participantId}
                  initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}
                  className={`flex justify-between items-center py-4 px-6 mb-2 rounded-xl ${i === 0 ? 'bg-primary/20 border border-primary' : 'bg-surface border border-border'}`}>
                  <span className="flex items-center gap-3">
                    <span className={`text-3xl font-black ${i === 0 ? 'text-primary' : 'text-gray-500'}`}>#{r.position}</span>
                    <span className="text-white text-xl font-bold">{r.name}</span>
                  </span>
                  <span className="text-white text-2xl font-black">{r.totalScore}<span className="text-gray-500 text-sm ml-1">pts</span></span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── GROUP RESULTS ── */}
        {showResults === "group" && groupResults && (
          <motion.div key="group-results"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <h2 className="text-xl text-primary font-bold uppercase tracking-[0.3em] mb-6">🏆 Ranking del Grupo</h2>
            <div className="w-full max-w-lg">
              {groupResults.ranking?.slice(0, 8).map((r: any, i: number) => (
                <motion.div key={r.participantId}
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.2 }}
                  className={`flex justify-between items-center py-4 px-6 mb-2 rounded-xl ${
                    i === 0 ? 'bg-yellow-500/20 border border-yellow-500 text-yellow-500' : 
                    i === 1 ? 'bg-gray-400/10 border border-gray-400' : 
                    i === 2 ? 'bg-orange-500/10 border border-orange-700' : 'bg-surface border border-border'
                  }`}>
                  <span className="flex items-center gap-3">
                    <span className="text-3xl font-black">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${r.position}`}</span>
                    <span className="text-white text-xl font-bold">{r.name}</span>
                    {r.isTied && <span className="text-yellow-500 text-xs font-bold bg-yellow-500/20 px-2 py-1 rounded">EMPATE</span>}
                  </span>
                  <span className="text-white text-2xl font-black">{r.totalScore}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── CLASSIFICATION ── */}
        {showResults === "classification" && classification && (
          <motion.div key="classification"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <h2 className="text-xl text-green-500 font-bold uppercase tracking-[0.3em] mb-6">
              🎯 Clasificación — Top {Math.round(classification.qualifyPercent * 100)}%
            </h2>
            <div className="w-full max-w-lg">
              {classification.qualified?.map((r: any, i: number) => (
                <motion.div key={r.participantId}
                  initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex justify-between items-center py-3 px-5 mb-1 rounded-lg bg-green-500/10 border border-green-500/30">
                  <span className="text-green-300 font-bold">✅ #{r.globalPosition} {r.name}</span>
                  <span className="text-white font-bold">{r.totalScore}</span>
                </motion.div>
              ))}
              {classification.eliminated?.slice(0, 5).map((r: any, i: number) => (
                <motion.div key={r.participantId}
                  initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex justify-between items-center py-2 px-5 mb-1 rounded-lg bg-red-500/5 border border-red-500/20">
                  <span className="text-red-400/50">#{r.globalPosition} {r.name}</span>
                  <span className="text-gray-600">{r.totalScore}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
