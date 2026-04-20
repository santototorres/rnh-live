"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import Papa from "papaparse";

export default function AdminView() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<any>(null);
  const [structure, setStructure] = useState<any>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // Judge creation
  const [newJudgeName, setNewJudgeName] = useState("");
  const [newJudgePin, setNewJudgePin] = useState("");
  const [newJudgeCatId, setNewJudgeCatId] = useState("");

  // Tab control
  const [tab, setTab] = useState<"config" | "control" | "results">("config");

  // Results
  const [classification, setClassification] = useState<any>(null);
  const [pasadaResults, setPasadaResults] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/rnh/api";

  const fetchStructure = async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/structure`);
      if (res.ok) setStructure(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchStructure(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit("request_state");
    socket.on("state_update", (s) => setState(s));
    socket.on("pasada_results", (d) => setPasadaResults(d));
    socket.on("round_classification", (d) => setClassification(d));
    return () => {
      socket.off("state_update");
      socket.off("pasada_results");
      socket.off("round_classification");
    };
  }, [socket]);

  // ── Google Sheets Sync ──
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      let docId = sheetUrl;
      const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match?.[1]) docId = match[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error("No se pudo descargar. Verifica que el enlace sea público.");
      const csvText = await response.text();

      Papa.parse(csvText, {
        complete: async (results) => {
          try {
            const res = await fetch(`${apiUrl}/admin/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participants: results.data })
            });
            const data = await res.json();
            if (res.ok) {
              alert(`✅ ${data.totalParticipants} rollers en ${data.totalGroups} Grupos`);
              fetchStructure();
            } else alert(`Error: ${data.error}`);
          } catch { alert("Error de conexión"); }
          finally { setIsSyncing(false); setSheetUrl(""); }
        },
        header: true,
        skipEmptyLines: true,
      });
    } catch (err: any) {
      alert("Error: " + err.message);
      setIsSyncing(false);
    }
  };

  // ── Category Config ──
  const updateCat = async (catId: string, field: string, value: number) => {
    await fetch(`${apiUrl}/admin/category/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
    fetchStructure();
  };

  // ── Judge CRUD ──
  const createJudge = async () => {
    if (!newJudgeName || !newJudgePin || !newJudgeCatId) return;
    const res = await fetch(`${apiUrl}/admin/judges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newJudgeName, pin: newJudgePin, categoryId: newJudgeCatId })
    });
    if (res.ok) {
      setNewJudgeName(""); setNewJudgePin("");
      fetchStructure();
    } else {
      const d = await res.json();
      alert(d.error);
    }
  };

  const deleteJudge = async (id: string) => {
    if (!confirm("¿Eliminar este juez?")) return;
    await fetch(`${apiUrl}/admin/judges/${id}`, { method: 'DELETE' });
    fetchStructure();
  };

  // ── Tournament Actions ──
  const startTournament = (categoryId: string) => {
    if (!socket || !structure) return;
    socket.emit("admin_start_tournament", { tournamentId: structure.id, categoryId });
    setTab("control");
  };

  const randomizeGroups = async (catId: string) => {
    if (!confirm("¿Reorganizar aleatoriamente todos los grupos de esta categoría?")) return;
    try {
      const res = await fetch(`${apiUrl}/admin/category/${catId}/randomize`, { method: 'POST' });
      if (res.ok) fetchStructure();
      else alert("Error al realizar el sorteo");
    } catch { alert("Error de conexión"); }
  };

  const setActiveParticipant = (participantId: string) => {
    socket?.emit("admin_set_participant", { participantId });
  };

  const forceClosePasada = () => socket?.emit("admin_force_close_pasada");
  const forceNextGroup = () => socket?.emit("admin_force_next_group");
  const resetTournament = async () => {
    if (!confirm("⚠️ ¿Borrar TODOS los datos del torneo? Esta acción es irreversible.")) return;
    await fetch(`${apiUrl}/admin/reset`, { method: 'POST' });
    socket?.emit("admin_reset");
    setStructure(null);
    fetchStructure();
  };

  const generateNextRound = (qualifiedIds: string[]) => {
    socket?.emit("admin_generate_next_round", { qualifiedIds });
  };

  // ───────── RENDER ─────────
  const categories = structure?.categories || [];

  return (
    <div className="flex-1 flex flex-col bg-surface min-h-screen">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-border bg-background">
        <div>
          <h1 className="text-2xl font-black uppercase text-white">Centro de Control</h1>
          <p className="text-xs text-gray-500 font-mono">ADMIN • RNH</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
            {connected ? "LIVE" : "OFFLINE"}
          </div>
          <button onClick={resetTournament} className="text-xs text-red-500 hover:text-red-400 font-bold">Reset</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex border-b border-border bg-background">
        {(["config", "control", "results"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-300'}`}>
            {t === "config" ? "⚙ Configuración" : t === "control" ? "🎮 Control" : "📊 Resultados"}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {/* ══════════ CONFIG TAB ══════════ */}
        {tab === "config" && (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {/* Google Sheets */}
            <section className="bg-background border border-border p-5 rounded-xl">
              <h2 className="text-lg font-bold text-white mb-4 uppercase border-l-4 border-primary pl-3">Participantes</h2>
              <div className="flex gap-2">
                <input type="text" placeholder="URL de Google Sheets..." value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-lg p-3 text-white focus:border-primary focus:outline-none text-sm" />
                <button onClick={handleSync} disabled={isSyncing || !sheetUrl}
                  className="bg-primary text-white font-bold px-6 rounded-lg disabled:opacity-50 text-sm">
                  {isSyncing ? "..." : "Sync"}
                </button>
              </div>
              <button onClick={fetchStructure} className="mt-2 text-xs text-gray-500 hover:text-white">⟳ Actualizar</button>
            </section>

            {/* Category Config */}
            {categories.map((cat: any) => (
              <section key={cat.id} className="bg-background border border-border p-5 rounded-xl">
                <h3 className="text-lg font-black text-primary uppercase mb-4">{cat.name}</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Pasadas</label>
                    <input type="number" value={cat.pasadasCount} min={1} max={10}
                      onChange={e => updateCat(cat.id, 'pasadasCount', parseInt(e.target.value))}
                      className="w-full bg-surface border border-border rounded p-2 text-white text-center" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Grupo Size</label>
                    <input type="number" value={cat.groupSize} min={2} max={10}
                      onChange={e => updateCat(cat.id, 'groupSize', parseInt(e.target.value))}
                      className="w-full bg-surface border border-border rounded p-2 text-white text-center" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">% Clasif.</label>
                    <input type="number" value={Math.round(cat.qualifyPercent * 100)} min={10} max={100}
                      onChange={e => updateCat(cat.id, 'qualifyPercent', parseInt(e.target.value) / 100)}
                      className="w-full bg-surface border border-border rounded p-2 text-white text-center" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">N° Jueces</label>
                    <input type="number" value={cat.judgesCount} min={1} max={10}
                      onChange={e => updateCat(cat.id, 'judgesCount', parseInt(e.target.value))}
                      className="w-full bg-surface border border-border rounded p-2 text-white text-center" />
                  </div>
                </div>

                {/* Judges */}
                <h4 className="text-sm font-bold text-gray-400 uppercase mb-2 mt-4">Jueces ({cat.judges?.length || 0})</h4>
                <div className="flex flex-col gap-2 mb-3">
                  {cat.judges?.map((j: any) => (
                    <div key={j.id} className="flex justify-between items-center bg-surface rounded-lg p-2 px-3">
                      <span className="text-white text-sm">{j.name} <span className="text-gray-500">PIN: {j.pin}</span></span>
                      <button onClick={() => deleteJudge(j.id)} className="text-red-500 text-xs hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input type="text" placeholder="Nombre" value={newJudgeCatId === cat.id ? newJudgeName : ''} 
                    onFocus={() => setNewJudgeCatId(cat.id)}
                    onChange={e => { setNewJudgeName(e.target.value); setNewJudgeCatId(cat.id); }}
                    className="flex-1 bg-surface border border-border rounded p-2 text-white text-sm" />
                  <input type="text" placeholder="PIN" value={newJudgeCatId === cat.id ? newJudgePin : ''} 
                    onFocus={() => setNewJudgeCatId(cat.id)}
                    onChange={e => { setNewJudgePin(e.target.value); setNewJudgeCatId(cat.id); }}
                    className="w-24 bg-surface border border-border rounded p-2 text-white text-sm text-center" />
                  <button onClick={createJudge} className="bg-primary text-white font-bold px-4 rounded text-sm">+</button>
                </div>

                {/* Start */}
                <div className="flex flex-col sm:flex-row gap-2 w-full mt-4">
                  <button onClick={() => randomizeGroups(cat.id)}
                    className="bg-blue-600/30 border-2 border-blue-600 text-blue-400 font-bold p-3 rounded-xl hover:bg-blue-600 hover:text-white flex-1 transition-all shadow-lg text-sm sm:text-base">
                    🎲 Realizar Sorteo
                  </button>
                  <button onClick={() => startTournament(cat.id)}
                    className="bg-green-600 text-white font-bold p-3 rounded-xl hover:bg-green-500 flex-[2] uppercase tracking-wider shadow-lg text-sm sm:text-base">
                    ▶ Inicio Clasificaciones — {cat.name}
                  </button>
                </div>

                {/* Grupos preview */}
                <div className="mt-4">
                  {cat.rounds?.[0]?.groups?.map((g: any) => (
                    <div key={g.id} className="mb-2">
                      <span className="text-gray-500 text-xs font-bold uppercase">{g.name}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {g.participants?.map((gp: any) => (
                          <span key={gp.participant.id} className="bg-surface text-gray-400 text-xs px-2 py-1 rounded border border-border">
                            {gp.participant.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ══════════ CONTROL TAB ══════════ */}
        {tab === "control" && (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {/* Live status */}
            <section className="bg-background border border-border p-5 rounded-xl">
              <h2 className="text-lg font-bold text-white mb-3 uppercase border-l-4 border-primary pl-3">Estado en Vivo</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-surface p-3 rounded-lg">
                  <span className="text-gray-500 block text-xs">FASE</span>
                  <span className="text-primary font-bold uppercase">{state?.status?.replace(/_/g, ' ') || '—'}</span>
                </div>
                <div className="bg-surface p-3 rounded-lg">
                  <span className="text-gray-500 block text-xs">CATEGORÍA</span>
                  <span className="text-white font-bold">{state?.activeCategoryName || '—'}</span>
                </div>
                <div className="bg-surface p-3 rounded-lg">
                  <span className="text-gray-500 block text-xs">GRUPO</span>
                  <span className="text-white font-bold">{state?.activeGroupName || '—'}</span>
                </div>
                <div className="bg-surface p-3 rounded-lg">
                  <span className="text-gray-500 block text-xs">PASADA</span>
                  <span className="text-white font-bold">{state?.activePasadaNumber || 0} / {state?.totalPasadas || 0}</span>
                </div>
              </div>

              {/* Consensus indicator */}
              <div className="mt-3 bg-surface p-3 rounded-lg">
                <span className="text-gray-500 text-xs block mb-1">CONSENSO JUECES</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-gray-400">Terminar: {state?.consensus?.endPasada?.length || 0}/{state?.judgesRequired || 0}</span>
                  <span className="text-gray-400">Siguiente: {state?.consensus?.nextPasada?.length || 0}/{state?.judgesRequired || 0}</span>
                  <span className="text-gray-400">Grupo: {state?.consensus?.nextGroup?.length || 0}/{state?.judgesRequired || 0}</span>
                </div>
              </div>
            </section>

            {/* Participant selector */}
            {state?.status === "pasada_activa" && state?.groupParticipants?.length > 0 && (
              <section className="bg-background border border-border p-5 rounded-xl">
                <h3 className="text-sm font-bold text-white uppercase mb-3">Participantes en el Spot</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {state.groupParticipants.map((p: any) => (
                    <button key={p.id} onClick={() => setActiveParticipant(p.id)}
                      className={`p-3 rounded-lg text-sm font-bold transition-all ${
                        state.activeParticipantId === p.id 
                          ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                          : 'bg-surface text-gray-400 hover:bg-gray-800 border border-border'
                      }`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Emergency buttons */}
            <section className="bg-background border border-red-900/50 p-5 rounded-xl">
              <h3 className="text-sm font-bold text-red-500 uppercase mb-3">⚠ Acciones de Emergencia</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={forceClosePasada} className="bg-red-900/50 text-red-400 font-bold py-3 rounded-lg hover:bg-red-900 text-sm">
                  Forzar Cierre Pasada
                </button>
                <button onClick={forceNextGroup} className="bg-red-900/50 text-red-400 font-bold py-3 rounded-lg hover:bg-red-900 text-sm">
                  Forzar Siguiente Grupo
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ══════════ RESULTS TAB ══════════ */}
        {tab === "results" && (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {pasadaResults && (
              <section className="bg-background border border-border p-5 rounded-xl">
                <h3 className="text-lg font-bold text-white uppercase mb-3">Última Pasada ({pasadaResults.pasadaNumber})</h3>
                {pasadaResults.ranking?.map((r: any) => (
                  <div key={r.participantId} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-gray-300"><span className="text-primary font-bold mr-2">#{r.position}</span>{r.name}</span>
                    <span className="text-white font-bold">{r.totalScore} pts</span>
                  </div>
                ))}
              </section>
            )}

            {classification && (
              <section className="bg-background border border-green-900/50 p-5 rounded-xl">
                <h3 className="text-lg font-bold text-green-500 uppercase mb-3">
                  Clasificación (Top {Math.round(classification.qualifyPercent * 100)}%)
                </h3>
                <h4 className="text-sm text-green-400 font-bold mb-2">✅ Clasificados ({classification.qualified?.length})</h4>
                {classification.qualified?.map((r: any) => (
                  <div key={r.participantId} className="flex justify-between py-1 text-sm">
                    <span className="text-green-300">#{r.globalPosition} {r.name}</span>
                    <span className="text-white font-bold">{r.totalScore}</span>
                  </div>
                ))}
                
                <h4 className="text-sm text-red-400 font-bold mb-2 mt-4">❌ Eliminados ({classification.eliminated?.length})</h4>
                {classification.eliminated?.map((r: any) => (
                  <div key={r.participantId} className="flex justify-between py-1 text-sm">
                    <span className="text-red-300/50">#{r.globalPosition} {r.name}</span>
                    <span className="text-gray-500">{r.totalScore}</span>
                  </div>
                ))}

                <button onClick={() => generateNextRound(classification.qualified.map((q: any) => q.participantId))}
                  className="mt-4 w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-500 uppercase">
                  🏆 Inicio de Finales →
                </button>
              </section>
            )}

            {!pasadaResults && !classification && (
              <p className="text-gray-500 text-center italic mt-8">Los resultados aparecerán aquí conforme avance el torneo.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
