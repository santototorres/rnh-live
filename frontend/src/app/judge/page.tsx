"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function JudgeView() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  
  // Auth
  const [judge, setJudge] = useState<any>(null);
  const [pinInput, setPinInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Consensus feedback
  const [myEndPasada, setMyEndPasada] = useState(false);
  const [myNextPasada, setMyNextPasada] = useState(false);
  const [myNextGroup, setMyNextGroup] = useState(false);

  // Pasada results
  const [pasadaResults, setPasadaResults] = useState<any>(null);
  const [groupResults, setGroupResults] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem("rnh_judge");
    if (stored) setJudge(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!socket || !judge) return;
    
    socket.emit("request_state");

    socket.on("state_update", (newState) => {
      setState(newState);
      // Reset consensus buttons on state transitions
      if (newState.status === "pasada_activa") {
        setMyEndPasada(false);
        setPasadaResults(null);
      }
      if (newState.status === "pasada_cerrada") {
        setMyNextPasada(false);
      }
      if (newState.status === "grupo_cerrado") {
        setMyNextGroup(false);
      }
    });

    socket.on("pasada_results", (data) => {
      setPasadaResults(data);
    });

    socket.on("group_results", (data) => {
      setGroupResults(data);
    });

    socket.on("consensus_progress", (data) => {
      // Force re-render for consensus UI
    });

    socket.on("score_error", (data) => {
      alert(data.message);
    });

    return () => {
      socket.off("state_update");
      socket.off("pasada_results");
      socket.off("group_results");
      socket.off("consensus_progress");
      socket.off("score_error");
    };
  }, [socket, judge]);

  // ── Login ──
  const handleLogin = async () => {
    if (!pinInput) return;
    setLoginLoading(true);
    setLoginError("");
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
        setLoginError(data.error || "PIN inválido");
      }
    } catch {
      setLoginError("Error de conexión");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setJudge(null);
    localStorage.removeItem("rnh_judge");
    setScores({});
  };

  // ── Score ──
  const handleScore = (participantId: string, val: number) => {
    if (!socket || !judge || state?.status !== "pasada_activa") return;
    setScores(prev => ({ ...prev, [participantId]: val }));
    socket.emit("submit_score", { score: val, judgeId: judge.id, participantId });
  };

  // ── Consensus actions ──
  const handleEndPasada = () => {
    if (!socket || !judge) return;
    setMyEndPasada(true);
    socket.emit("judge_end_pasada", { judgeId: judge.id });
  };

  const handleNextPasada = () => {
    if (!socket || !judge) return;
    setMyNextPasada(true);
    socket.emit("judge_next_pasada", { judgeId: judge.id });
  };

  const handleNextGroup = () => {
    if (!socket || !judge) return;
    setMyNextGroup(true);
    socket.emit("judge_next_group", { judgeId: judge.id });
  };

  // ─────────── LOGIN SCREEN ───────────
  if (!judge) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-background min-h-screen">
        <div className="w-full max-w-sm bg-surface p-8 rounded-2xl border border-border text-center">
          <h2 className="text-2xl font-black text-white mb-2 uppercase">Identificación</h2>
          <p className="text-gray-400 mb-6 text-sm">Ingresa tu PIN asignado por el Admin</p>
          
          <input 
            type="number" 
            placeholder="****"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl p-4 text-center text-4xl text-white font-black tracking-[1em] focus:border-primary focus:outline-none mb-4"
            maxLength={4}
          />

          {loginError && (
            <p className="text-red-500 text-sm mb-4 font-bold">{loginError}</p>
          )}
          
          <button 
            onClick={handleLogin}
            disabled={loginLoading || !pinInput}
            className="w-full bg-primary text-white font-bold p-4 rounded-xl hover:bg-primary-hover disabled:opacity-50"
          >
            {loginLoading ? "Verificando..." : "Entrar a Calificar"}
          </button>
        </div>
      </div>
    );
  }

  // ─────────── MAIN JUDGE VIEW ───────────
  const isPasadaActiva = state?.status === "pasada_activa";
  const isPasadaCerrada = state?.status === "pasada_cerrada";
  const isGrupoCerrado = state?.status === "grupo_cerrado";
  const participants = state?.groupParticipants || [];
  const consensusEnd = state?.consensus?.endPasada || [];
  const consensusNext = state?.consensus?.nextPasada || [];
  const consensusGroup = state?.consensus?.nextGroup || [];

  return (
    <div className="flex-1 flex flex-col p-4 bg-background min-h-screen">
      {/* Header */}
      <header className="flex justify-between items-center mb-4 border-b border-border pb-3">
        <div>
          <h1 className="text-lg font-bold uppercase text-white">Panel de Juez</h1>
          <p className="text-xs text-primary font-bold">{judge.name} • {judge.categoryName || 'Categoría'}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
            {connected ? "LIVE" : "OFF"}
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-white">Salir</button>
        </div>
      </header>

      {/* Status bar */}
      <div className="bg-surface rounded-xl p-3 mb-4 flex justify-between items-center text-sm">
        <span className="text-gray-400">{state?.activeGroupName || "—"} • Pasada {state?.activePasadaNumber || 0}/{state?.totalPasadas || 0}</span>
        <span className="text-primary font-bold uppercase">{state?.status?.replace(/_/g, ' ') || "ESPERANDO"}</span>
      </div>

      {/* ── PASADA ACTIVA: Scoring ── */}
      {isPasadaActiva && (
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
          <h3 className="text-white font-bold uppercase text-sm tracking-wider mb-1">Califica a cada participante:</h3>
          
          {participants.map((p: any) => {
            const isActive = state?.activeParticipantId === p.id;
            const currentScore = scores[p.id];
            return (
              <div key={p.id} className={`p-3 rounded-xl border transition-all ${isActive ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' : 'border-border bg-surface'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-bold ${isActive ? 'text-white text-lg' : 'text-gray-400'}`}>
                    {isActive && <span className="text-primary mr-2">▶</span>}
                    {p.name}
                  </span>
                  {currentScore && (
                    <span className="text-primary font-black text-xl">{currentScore}</span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <motion.button
                      key={val}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleScore(p.id, val)}
                      className={`py-3 rounded-lg text-lg font-black transition-all border-b-4 ${
                        currentScore === val 
                          ? 'bg-white text-black border-gray-400 border-b-0 translate-y-1' 
                          : 'bg-background text-primary border-primary/50 hover:bg-primary hover:text-white'
                      }`}
                    >
                      {val}
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* End pasada button */}
          <button 
            onClick={handleEndPasada}
            disabled={myEndPasada}
            className={`mt-4 w-full py-5 rounded-2xl font-black text-xl uppercase tracking-wider transition-all ${
              myEndPasada 
                ? 'bg-green-900/30 text-green-500 border border-green-500/50' 
                : 'bg-primary text-white hover:bg-primary-hover active:scale-95 shadow-lg'
            }`}
          >
            {myEndPasada 
              ? `✓ ESPERANDO CONSENSO (${consensusEnd.length}/${state?.judgesRequired || 3})` 
              : 'TERMINAR PASADA'}
          </button>
        </div>
      )}

      {/* ── PASADA CERRADA: Results + Next ── */}
      {isPasadaCerrada && (
        <div className="flex-1 flex flex-col gap-4">
          {pasadaResults && (
            <div className="bg-surface rounded-xl p-4 border border-border">
              <h3 className="text-white font-bold uppercase text-sm mb-3">Resultados Pasada {pasadaResults.pasadaNumber}</h3>
              {pasadaResults.ranking?.map((r: any) => (
                <div key={r.participantId} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-gray-300">
                    <span className="text-primary font-bold mr-2">#{r.position}</span>
                    {r.name}
                  </span>
                  <span className="text-white font-black">{r.totalScore} pts</span>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={handleNextPasada}
            disabled={myNextPasada}
            className={`w-full py-5 rounded-2xl font-black text-xl uppercase tracking-wider transition-all ${
              myNextPasada 
                ? 'bg-blue-900/30 text-blue-400 border border-blue-500/50' 
                : 'bg-primary text-white hover:bg-primary-hover active:scale-95 shadow-lg'
            }`}
          >
            {myNextPasada 
              ? `✓ ESPERANDO (${consensusNext.length}/${state?.judgesRequired || 3})` 
              : 'SIGUIENTE PASADA'}
          </button>
        </div>
      )}

      {/* ── GRUPO CERRADO: Group Results + Next Group ── */}
      {isGrupoCerrado && (
        <div className="flex-1 flex flex-col gap-4">
          {groupResults && (
            <div className="bg-surface rounded-xl p-4 border border-border">
              <h3 className="text-white font-bold uppercase text-sm mb-3">Ranking del Grupo</h3>
              {groupResults.ranking?.map((r: any) => (
                <div key={r.participantId} className={`flex justify-between items-center py-2 border-b border-border last:border-0 ${r.isTied ? 'bg-yellow-500/10' : ''}`}>
                  <span className="text-gray-300">
                    <span className="text-primary font-bold mr-2">#{r.position}</span>
                    {r.name}
                    {r.isTied && <span className="text-yellow-500 text-xs ml-2 font-bold">EMPATE</span>}
                  </span>
                  <span className="text-white font-black">{r.totalScore} pts</span>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={handleNextGroup}
            disabled={myNextGroup}
            className={`w-full py-5 rounded-2xl font-black text-xl uppercase tracking-wider transition-all ${
              myNextGroup 
                ? 'bg-purple-900/30 text-purple-400 border border-purple-500/50' 
                : 'bg-primary text-white hover:bg-primary-hover active:scale-95 shadow-lg'
            }`}
          >
            {myNextGroup 
              ? `✓ ESPERANDO (${consensusGroup.length}/${state?.judgesRequired || 3})` 
              : 'SIGUIENTE GRUPO'}
          </button>
        </div>
      )}

      {/* ── WAITING STATES ── */}
      {!isPasadaActiva && !isPasadaCerrada && !isGrupoCerrado && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
              className="w-20 h-20 border-4 border-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-primary font-black text-2xl">⏳</span>
            </motion.div>
            <p className="text-gray-400 font-bold uppercase tracking-widest">Esperando que el Admin inicie...</p>
          </div>
        </div>
      )}
    </div>
  );
}
