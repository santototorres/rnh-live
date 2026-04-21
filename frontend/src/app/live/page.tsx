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

  // Live scenes
  const [configuredParams, setConfiguredParams] = useState<any>(null);
  const [raffleGroups, setRaffleGroups] = useState<any>(null); // { type, categoryName, groups }
  const [rafflePhase, setRafflePhase] = useState<"spinning" | "done" | null>(null);
  const [shuffledNames, setShuffledNames] = useState<string[]>([]);
  const [liveScene, setLiveScene] = useState<"idle" | "configured" | "raffle" | "groups">("idle");

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
      setLiveScene("idle");
    });

    socket.on("live_category_configured", (d) => {
      setConfiguredParams(d);
      setLiveScene("configured");
      setRafflePhase(null);
      setShowResults(null);
    });

    socket.on("live_raffle_start", (d) => {
      setRaffleGroups(d);
      setLiveScene("raffle");
      setRafflePhase("spinning");
      setShowResults(null);
    });

    socket.on("live_raffle_groups", (d) => {
      setRaffleGroups((prev: any) => ({ ...prev, ...d }));
      setRafflePhase("done");
    });

    // When admin emits admin_raffle_done the backend turns it into live_raffle_groups
    // But we also handle it here directly:
    socket.on("admin_raffle_done", (d) => {
      setRaffleGroups(d);
      setLiveScene("raffle");
      setRafflePhase("spinning");
      setShowResults(null);
    });

    return () => {
      socket.off("state_update");
      socket.off("pasada_results");
      socket.off("group_results");
      socket.off("round_classification");
      socket.off("live_category_configured");
      socket.off("live_raffle_start");
      socket.off("live_raffle_groups");
      socket.off("admin_raffle_done");
    };
  }, [socket]);

  // Raffle spinning animation
  useEffect(() => {
    if (rafflePhase !== "spinning" || !raffleGroups) return;
    // Collect all participant names from groups
    const allNames: string[] = [];
    if (raffleGroups.groups) {
      raffleGroups.groups.forEach((g: any) => {
        g.participants?.forEach((gp: any) => {
          allNames.push(gp.participant?.name || gp.name || gp);
        });
      });
    }
    if (allNames.length === 0) {
      setTimeout(() => setRafflePhase("done"), 1500);
      return;
    }

    let idx = 0;
    const interval = setInterval(() => {
      const shuffled = [...allNames].sort(() => Math.random() - 0.5);
      setShuffledNames(shuffled.slice(0, Math.min(8, shuffled.length)));
      idx++;
      if (idx > 35) {
        clearInterval(interval);
        setTimeout(() => {
          setRafflePhase("done");
          setLiveScene("groups");
        }, 500);
      }
    }, 110);
    return () => clearInterval(interval);
  }, [rafflePhase, raffleGroups]);

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
        <img src="/rnh/logornh.png" alt="Roll Not Hate" className="h-14 md:h-20 object-contain drop-shadow-lg" />
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
        {!isActive && !showResults && liveScene === "idle" && (
          <motion.div key="standby"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -50 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <motion.div animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }} transition={{ repeat: Infinity, duration: 3 }}
              className="mb-8 flex items-center justify-center">
              <img src="/rnh/logornh.png" alt="RNH Logo" className="w-48 md:w-64 h-auto object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-black uppercase text-white tracking-widest mt-4">ROLL NOT HATE</h1>
            <div className="mt-8 flex gap-2">
              <motion.div initial={{ width: 0 }} animate={{ width: "120px" }} className="h-1.5 bg-primary/50 skew-x-[12deg]" />
              <motion.div initial={{ width: 0 }} animate={{ width: "60px" }} transition={{ delay: 0.2 }} className="h-1.5 bg-white/30 skew-x-[12deg]" />
            </div>
          </motion.div>
        )}

        {/* ── CONFIGURED PARAMS HUD ── */}
        {!isActive && !showResults && liveScene === "configured" && configuredParams && (
          <motion.div key="configured"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8 gap-8">

            <motion.h2
              initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
              className="text-xl md:text-2xl font-bold text-gray-400 uppercase tracking-[0.4em]">
              Configuración
            </motion.h2>

            <motion.h1
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: "spring" }}
              className="text-4xl md:text-6xl font-black uppercase text-white tracking-wider">
              {configuredParams.categoryName}
            </motion.h1>

            <div className="grid grid-cols-3 md:grid-cols-3 gap-6 mt-4">
              {[
                { label: "PASADAS", value: configuredParams.pasadasCount, icon: "🔄", color: "text-blue-400" },
                { label: "POR GRUPO", value: configuredParams.groupSize, icon: "👥", color: "text-purple-400" },
                { label: "CLASIFICAN", value: configuredParams.qualifyCount, icon: "🏆", color: "text-green-400" },
              ].map((item, i) => (
                <motion.div key={item.label}
                  initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.15, type: "spring" }}
                  className="bg-surface/60 backdrop-blur border border-border rounded-2xl p-6 min-w-[140px]">
                  <span className="text-4xl block mb-3">{item.icon}</span>
                  <span className={`text-5xl md:text-7xl font-black block ${item.color}`}>{item.value}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold mt-2 block">{item.label}</span>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
              className="flex gap-2 mt-6">
              <div className="h-1.5 w-20 bg-primary/50 skew-x-[12deg]" />
              <div className="h-1.5 w-10 bg-white/30 skew-x-[12deg]" />
            </motion.div>
          </motion.div>
        )}

        {/* ── RAFFLE SPINNING ── */}
        {!isActive && !showResults && liveScene === "raffle" && rafflePhase === "spinning" && (
          <motion.div key="spinning"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <motion.div className="flex flex-col items-center gap-6">
              <motion.h2
                animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-2xl md:text-4xl font-black uppercase text-primary tracking-[0.3em]">
                🎲 Sorteando...
              </motion.h2>
              <p className="text-gray-500 text-sm uppercase tracking-widest">{raffleGroups?.categoryName}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
                {shuffledNames.map((name, i) => (
                  <motion.div key={`${name}-${i}`}
                    initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.08 }}
                    className="bg-surface/80 backdrop-blur border border-primary/30 rounded-xl px-4 py-3 text-white font-bold text-sm md:text-base shadow-[0_0_20px_rgba(255,45,45,0.15)]">
                    {name}
                  </motion.div>
                ))}
              </div>
              <motion.div
                animate={{ scaleX: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="h-1.5 w-40 bg-primary rounded-full mt-4"
              />
            </motion.div>
          </motion.div>
        )}

        {/* ── GROUPS REVEAL ── */}
        {!isActive && !showResults && liveScene === "groups" && raffleGroups && (
          <motion.div key="groups"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center z-10 p-6 w-full max-w-5xl mx-auto">

            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-6 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-[0.4em] mb-1">
                {raffleGroups.type === 'clasificaciones' ? 'Grupos de Clasificación' : 'Grupos de Finales'}
              </p>
              <h2 className="text-3xl md:text-5xl font-black uppercase text-white">{raffleGroups.categoryName}</h2>
              <div className="flex gap-2 mt-3 justify-center">
                <div className="h-1 w-16 bg-primary/50 skew-x-[12deg]" />
                <div className="h-1 w-8 bg-white/20 skew-x-[12deg]" />
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full">
              {raffleGroups.groups?.map((g: any, gi: number) => (
                <motion.div key={g.id || gi}
                  initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.12, type: "spring" }}
                  className="bg-surface/70 backdrop-blur border border-border rounded-2xl p-4 text-left">
                  <span className="text-primary text-xs font-black uppercase tracking-wider block mb-3">{g.name}</span>
                  <div className="space-y-1.5">
                    {g.participants?.map((gp: any, pi: number) => (
                      <motion.div key={gp.participant?.id || pi}
                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: gi * 0.12 + pi * 0.08 }}
                        className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs font-mono w-4">{pi + 1}.</span>
                        <span className="text-white font-bold text-sm">{gp.participant?.name || gp.name}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
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
                EN EL SPOT
              </span>
            </div>

            <h1 className="text-[4rem] sm:text-[6rem] lg:text-[10rem] xl:text-[13rem] font-black uppercase text-white tracking-tighter italic -skew-x-[12deg] leading-[0.85] mb-8 drop-shadow-[0_10px_15px_rgba(0,0,0,0.8)] max-w-[95vw] truncate px-6">
              {state?.activeParticipantName || "..."}
            </h1>

            <motion.img
              src="/rnh/hueso.png"
              alt="Hueso"
              className="w-48 md:w-80 object-contain absolute bottom-[15%] z-[-1] opacity-60"
              animate={{ y: [0, -30, 0], rotate: [-8, 8, -8] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="flex gap-3 mt-4">
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

        {/* ── CLASSIFICATION (Round 1 — Clasificados/Eliminados) ── */}
        {showResults === "classification" && classification && classification.roundNumber === 1 && (
          <motion.div key="classification"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">
            <h2 className="text-xl text-green-500 font-bold uppercase tracking-[0.3em] mb-2">
              🎯 Clasificación — {classification.categoryName}
            </h2>
            <p className="text-gray-500 text-sm mb-6">Top {classification.qualifyCount} clasifican a Finales</p>
            <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-green-400 font-bold uppercase mb-2">✅ Clasificados</p>
                {classification.qualified?.map((r: any, i: number) => (
                  <motion.div key={r.participantId}
                    initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="flex justify-between items-center py-2.5 px-4 mb-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
                    <span className="text-green-300 font-bold">✅ #{r.globalPosition} {r.name}</span>
                    <span className="text-white font-bold">{r.totalScore}</span>
                  </motion.div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-red-400 font-bold uppercase mb-2">❌ Eliminados</p>
                {classification.eliminated?.map((r: any, i: number) => (
                  <motion.div key={r.participantId}
                    initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.5 + i * 0.06 }}
                    className="flex justify-between items-center py-2.5 px-4 mb-1.5 rounded-lg bg-red-500/5 border border-red-500/20">
                    <span className="text-red-400/60">#{r.globalPosition} {r.name}</span>
                    <span className="text-gray-600">{r.totalScore}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PODIO FINAL (Round 2+) ── */}
        {showResults === "classification" && classification && classification.roundNumber >= 2 && (
          <motion.div key="podio"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full z-10 p-8">

            <motion.h2
              initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="text-2xl md:text-4xl font-black uppercase text-yellow-400 tracking-[0.2em] mb-2">
              🏆 PODIO FINAL
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="text-gray-500 uppercase tracking-widest text-sm mb-10">
              {classification.categoryName}
            </motion.p>

            {/* Podio visual */}
            <div className="flex justify-center items-end gap-4 mb-8">
              {/* 2nd */}
              {classification.qualified?.[1] && (
                <motion.div
                  initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: "spring" }}
                  className="flex flex-col items-center">
                  <span className="text-5xl mb-3">🥈</span>
                  <div className="bg-gray-500/20 border-2 border-gray-400 rounded-2xl p-4 w-36 text-center mb-0 shadow-lg">
                    <span className="text-white font-black text-base block">{classification.qualified[1].name}</span>
                    <span className="text-gray-400 text-sm">{classification.qualified[1].totalScore} pts</span>
                  </div>
                  <div className="bg-gradient-to-b from-gray-500 to-gray-700 w-36 h-20 rounded-b-xl flex items-center justify-center shadow-inner">
                    <span className="text-white font-black text-4xl">2°</span>
                  </div>
                </motion.div>
              )}
              {/* 1st */}
              {classification.qualified?.[0] && (
                <motion.div
                  initial={{ opacity: 0, y: 80 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, type: "spring" }}
                  className="flex flex-col items-center">
                  <motion.span
                    animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-6xl mb-3 block">🥇</motion.span>
                  <div className="bg-yellow-500/20 border-2 border-yellow-400 rounded-2xl p-4 w-44 text-center shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                    <span className="text-white font-black text-lg block">{classification.qualified[0].name}</span>
                    <span className="text-yellow-400 text-sm font-bold">{classification.qualified[0].totalScore} pts</span>
                  </div>
                  <div className="bg-gradient-to-b from-yellow-500 to-yellow-700 w-44 h-32 rounded-b-xl flex items-center justify-center shadow-[0_0_20px_rgba(234,179,8,0.4)]">
                    <span className="text-white font-black text-5xl">1°</span>
                  </div>
                </motion.div>
              )}
              {/* 3rd */}
              {classification.qualified?.[2] && (
                <motion.div
                  initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, type: "spring" }}
                  className="flex flex-col items-center">
                  <span className="text-5xl mb-3">🥉</span>
                  <div className="bg-orange-500/20 border-2 border-orange-500 rounded-2xl p-4 w-36 text-center shadow-lg">
                    <span className="text-white font-black text-base block">{classification.qualified[2].name}</span>
                    <span className="text-orange-400 text-sm">{classification.qualified[2].totalScore} pts</span>
                  </div>
                  <div className="bg-gradient-to-b from-orange-600 to-orange-800 w-36 h-14 rounded-b-xl flex items-center justify-center">
                    <span className="text-white font-black text-3xl">3°</span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Ranking complete smaller */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
              className="w-full max-w-md">
              {[...classification.qualified, ...classification.eliminated]?.slice(3).map((r: any, i: number) => (
                <div key={r.participantId} className="flex justify-between py-1.5 text-sm border-b border-border/30 last:border-0">
                  <span className="text-gray-500">#{r.globalPosition} {r.name}</span>
                  <span className="text-gray-400">{r.totalScore} pts</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
