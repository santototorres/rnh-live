"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function JudgeView() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const stateRef = useRef<any>(null);
  
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

  // Live rankings from score_submitted events
  const [liveScores, setLiveScores] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("rnh_judge");
    if (stored) setJudge(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!socket || !judge) return;
    
    socket.emit("request_state");

    socket.on("state_update", (newState) => {
      // Use ref to get REAL previous state (avoids stale closure)
      const prev = stateRef.current;
      const prevStatus = prev?.status;
      const prevPasada = prev?.activePasadaNumber;
      const prevGroup = prev?.activeGroupId;

      setState(newState);
      stateRef.current = newState;

      // Reset scores ONLY when pasada number or group actually changes
      if (
        newState.status === "pasada_activa" && 
        (prevStatus !== "pasada_activa" || prevPasada !== newState.activePasadaNumber || prevGroup !== newState.activeGroupId)
      ) {
        setScores({});
        setMyEndPasada(false);
        setPasadaResults(null);
        setLiveScores([]);
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

    socket.on("score_submitted", (data) => {
      setLiveScores(prev => {
        const existing = prev.find(s => s.judgeId === data.judgeId && s.participantId === data.participantId);
        if (existing) {
          return prev.map(s => 
            s.judgeId === data.judgeId && s.participantId === data.participantId 
              ? { ...s, score: data.score } 
              : s
          );
        }
        return [...prev, data];
      });
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
      socket.off("score_submitted");
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

  // ── Compute live ranking from liveScores ──
  const computeLiveRanking = () => {
    const participants = state?.groupParticipants || [];
    const byParticipant: Record<string, { name: string; total: number; count: number }> = {};
    for (const p of participants) {
      byParticipant[p.id] = { name: p.name, total: 0, count: 0 };
    }
    for (const s of liveScores) {
      if (byParticipant[s.participantId]) {
        byParticipant[s.participantId].total += s.score;
        byParticipant[s.participantId].count += 1;
      }
    }
    return Object.entries(byParticipant)
      .map(([id, data]) => ({ id, ...data, avg: data.count > 0 ? (data.total / data.count).toFixed(1) : '—' }))
      .sort((a, b) => b.total - a.total);
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
  const liveRanking = computeLiveRanking();

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
          <h3 className="text-white font-bold uppercase text-sm tracking-wider mb-1">Califica de 0 a 10:</h3>
          
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
                  {currentScore !== null && currentScore !== undefined && (
                    <span className="text-primary font-black text-xl">{currentScore}</span>
                  )}
                </div>
                <div className="grid grid-cols-11 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                    <motion.button
                      key={val}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleScore(p.id, val)}
                      className={`py-2.5 rounded-lg text-sm font-black transition-all ${
                        currentScore === val 
                          ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105' 
                          : 'bg-background text-gray-400 border border-border hover:bg-primary/20 hover:text-primary'
                      }`}
                    >
                      {val}
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Live Ranking mini-table */}
          {liveRanking.length > 0 && liveRanking.some(r => r.count > 0) && (
            <div className="bg-surface rounded-xl p-3 border border-border mt-2">
              <h4 className="text-[10px] text-gray-500 font-bold uppercase mb-2">📊 Ranking en Vivo — Esta Pasada</h4>
              {liveRanking.map((r, i) => (
                <div key={r.id} className="flex justify-between items-center py-1 text-xs border-b border-border/50 last:border-0">
                  <span className="text-gray-300"><span className="text-primary font-bold mr-1.5">#{i + 1}</span>{r.name}</span>
                  <div className="flex gap-3">
                    <span className="text-gray-500">Promedio: {r.avg}</span>
                    <span className="text-white font-bold">{r.total} pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}

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
