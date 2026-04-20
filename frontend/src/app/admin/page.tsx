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

  // Sidebar
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Editable params (local state before saving)
  const [editParams, setEditParams] = useState<Record<string, any>>({});

  // Results
  const [classification, setClassification] = useState<any>(null);
  const [pasadaResults, setPasadaResults] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/rnh/api";

  const fetchStructure = async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/structure`);
      if (res.ok) {
        const data = await res.json();
        setStructure(data);
        if (!selectedCatId && data?.categories?.length > 0) {
          setSelectedCatId(data.categories[0].id);
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchStructure(); }, []);

  // When selectedCatId or structure changes, load the edit params
  useEffect(() => {
    if (!selectedCatId || !structure) return;
    const cat = structure.categories?.find((c: any) => c.id === selectedCatId);
    if (cat) {
      setEditParams({
        pasadasCount: cat.pasadasCount,
        groupSize: cat.groupSize,
        qualifyPercent: Math.round(cat.qualifyPercent * 100),
        judgesCount: cat.judgesCount
      });
    }
  }, [selectedCatId, structure]);

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

  // ── Save ALL params at once ──
  const saveParams = async (catId: string) => {
    try {
      await fetch(`${apiUrl}/admin/category/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pasadasCount: editParams.pasadasCount,
          groupSize: editParams.groupSize,
          qualifyPercent: editParams.qualifyPercent / 100,
          judgesCount: editParams.judgesCount
        })
      });
      alert("✅ Parámetros guardados correctamente");
      fetchStructure();
    } catch { alert("Error al guardar"); }
  };

  // ── Judge CRUD ──
  const createJudge = async () => {
    if (!newJudgeName || !newJudgePin || !selectedCatId) return;
    const res = await fetch(`${apiUrl}/admin/judges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newJudgeName, pin: newJudgePin, categoryId: selectedCatId })
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
    setSelectedCatId(null);
    fetchStructure();
  };

  const resetCategory = async (catId: string) => {
    if (!confirm("⚠️ ¿Borrar TODOS los datos de esta categoría? Se eliminarán grupos, jueces, participantes y puntajes. Esta acción es irreversible.")) return;
    try {
      const res = await fetch(`${apiUrl}/admin/category/${catId}/reset`, { method: 'POST' });
      if (res.ok) {
        socket?.emit("admin_reset"); // Emits global state update if active
        setStructure(null);
        setSelectedCatId(null);
        fetchStructure();
      } else {
        alert("Error al reiniciar la categoría");
      }
    } catch {
      alert("Error de conexión");
    }
  };

  const generateNextRound = (qualifiedIds: string[]) => {
    socket?.emit("admin_generate_next_round", { qualifiedIds });
  };

  // ───────── RENDER ─────────
  const categories = structure?.categories || [];
  const activeCat = categories.find((c: any) => c.id === selectedCatId);
  const isThisCatLive = state?.activeCategoryId === selectedCatId;

  // Check readiness
  const totalParticipants = activeCat?.rounds?.[0]?.groups?.reduce((acc: number, g: any) => acc + (g.participants?.length || 0), 0) || 0;
  const totalJudges = activeCat?.judges?.length || 0;
  const paramsReady = editParams.pasadasCount > 0 && editParams.groupSize > 0 && editParams.qualifyPercent > 0 && editParams.judgesCount > 0;
  const judgesReady = totalJudges >= (editParams.judgesCount || 1);
  const canStart = paramsReady && judgesReady && totalParticipants > 0;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ══════════ SIDEBAR ══════════ */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-background border-r border-border flex flex-col
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-black uppercase text-white tracking-wider">🎯 RNH</h1>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">CENTRO DE CONTROL</p>
          <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>
        </div>

        {/* Sync */}
        <div className="p-3 border-b border-border">
          <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Importar Participantes</label>
          <div className="flex gap-1">
            <input type="text" placeholder="URL Google Sheets..." value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
              className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-white text-[11px] focus:border-primary focus:outline-none" />
            <button onClick={handleSync} disabled={isSyncing || !sheetUrl}
              className="bg-primary text-white font-bold px-2 rounded text-[11px] disabled:opacity-50">
              {isSyncing ? "..." : "⬆"}
            </button>
          </div>
        </div>

        {/* Category List */}
        <div className="flex-1 overflow-y-auto p-2">
          <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2 px-2">Categorías</label>
          {categories.length === 0 && (
            <p className="text-gray-600 text-xs text-center italic mt-4">Sin categorías aún</p>
          )}
          {categories.map((cat: any) => {
            const isActive = selectedCatId === cat.id;
            const isLive = state?.activeCategoryId === cat.id;
            return (
              <button key={cat.id} onClick={() => { setSelectedCatId(cat.id); setSidebarOpen(false); }}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-all ${
                  isActive 
                    ? 'bg-primary/15 border border-primary/50 text-white' 
                    : 'hover:bg-surface text-gray-400 hover:text-white border border-transparent'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase">{cat.name}</span>
                  {isLive && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>}
                </div>
                <div className="flex gap-2 mt-1 text-[10px] text-gray-500">
                  <span>{cat.rounds?.[0]?.groups?.length || 0} grupos</span>
                  <span>•</span>
                  <span>{cat.judges?.length || 0} jueces</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-border flex flex-col gap-2">
          {activeCat && (
            <button onClick={() => resetCategory(activeCat.id)} className="w-full text-xs text-orange-500 hover:bg-orange-500/10 p-2 rounded font-bold transition-colors">
              🔄 Reiniciar {activeCat.name}
            </button>
          )}
          <button onClick={resetTournament} className="w-full text-xs text-red-500 hover:bg-red-500/10 p-2 rounded font-bold transition-colors">
            🗑 Reiniciar Todo El Torneo
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ══════════ MAIN CONTENT ══════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 p-3 bg-background border-b border-border">
          <button onClick={() => setSidebarOpen(true)} className="text-white text-xl">☰</button>
          <span className="text-white font-bold text-sm uppercase">{activeCat?.name || "RNH Admin"}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!activeCat ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">🛹</div>
                <h2 className="text-xl font-black text-white mb-2">Roll Not Hate</h2>
                <p className="text-gray-500 text-sm">
                  {categories.length === 0 
                    ? "Importa participantes desde Google Sheets para comenzar" 
                    : "Selecciona una categoría del panel lateral"}
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              
              {/* ── HEADER ── */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase">{activeCat.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{totalParticipants} participantes</p>
                </div>
                <div className="flex items-center gap-2">
                  {isThisCatLive && (
                    <div className="bg-green-500/20 border border-green-500/50 text-green-400 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse">
                      ● EN VIVO
                    </div>
                  )}
                  <button onClick={() => resetCategory(activeCat.id)}
                    className="bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">
                    🔄 Reiniciar Categoría
                  </button>
                </div>
              </div>

              {/* ═══════════════════════════════════════════ */}
              {/* STEP 1: PARAMETRIZACIÓN                     */}
              {/* ═══════════════════════════════════════════ */}
              <section className="bg-background border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase">① Parametrización</h3>
                  <div className="flex gap-2">
                    <button onClick={() => resetCategory(activeCat.id)}
                      className="bg-red-500/20 text-red-400 border border-red-500/50 font-bold px-4 py-2 rounded-lg hover:bg-red-500 hover:text-white text-xs uppercase tracking-wider transition-colors">
                      🔄 Reiniciar Categoría
                    </button>
                    <button onClick={() => saveParams(activeCat.id)}
                      className="bg-blue-600 text-white font-bold px-5 py-2 rounded-lg hover:bg-blue-500 text-xs uppercase tracking-wider transition-colors">
                      💾 Guardar Parámetros
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-surface p-4 rounded-lg text-center">
                    <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">N° Pasadas</label>
                    <input type="number" value={editParams.pasadasCount ?? 0} min={0} max={10}
                      onChange={e => setEditParams(prev => ({ ...prev, pasadasCount: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                  </div>
                  <div className="bg-surface p-4 rounded-lg text-center">
                    <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">Tamaño Grupo</label>
                    <input type="number" value={editParams.groupSize ?? 0} min={0} max={20}
                      onChange={e => setEditParams(prev => ({ ...prev, groupSize: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                  </div>
                  <div className="bg-surface p-4 rounded-lg text-center">
                    <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">% Clasifican</label>
                    <input type="number" value={editParams.qualifyPercent ?? 0} min={0} max={100}
                      onChange={e => setEditParams(prev => ({ ...prev, qualifyPercent: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                  </div>
                  <div className="bg-surface p-4 rounded-lg text-center">
                    <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">N° Jueces</label>
                    <input type="number" value={editParams.judgesCount ?? 0} min={0} max={10}
                      onChange={e => setEditParams(prev => ({ ...prev, judgesCount: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                  </div>
                </div>

                {!paramsReady && (
                  <p className="text-yellow-500 text-xs mt-3 font-bold">⚠ Todos los parámetros deben ser mayores a 0. Guárdalos antes de continuar.</p>
                )}
              </section>

              {/* ═══════════════════════════════════════════ */}
              {/* STEP 2: JUECES                              */}
              {/* ═══════════════════════════════════════════ */}
              <section className="bg-background border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">
                  ② Jueces ({totalJudges}/{editParams.judgesCount || 0})
                  {judgesReady && <span className="text-green-400 ml-2">✓</span>}
                  {!judgesReady && totalJudges > 0 && <span className="text-yellow-500 ml-2">— faltan {(editParams.judgesCount || 0) - totalJudges}</span>}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {activeCat.judges?.map((j: any) => (
                    <div key={j.id} className="flex justify-between items-center bg-surface rounded-lg p-2.5 px-3">
                      <div>
                        <span className="text-white text-sm font-bold">{j.name}</span>
                        <span className="text-gray-500 text-xs ml-2">PIN: {j.pin}</span>
                      </div>
                      <button onClick={() => deleteJudge(j.id)} className="text-red-500 text-xs hover:text-red-400 ml-2">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Nombre del juez" value={newJudgeName} onChange={e => setNewJudgeName(e.target.value)}
                    className="flex-1 bg-surface border border-border rounded px-3 py-2 text-white text-sm focus:border-primary focus:outline-none" />
                  <input type="text" placeholder="PIN" value={newJudgePin} onChange={e => setNewJudgePin(e.target.value)}
                    className="w-24 bg-surface border border-border rounded px-3 py-2 text-white text-sm text-center focus:border-primary focus:outline-none" />
                  <button onClick={createJudge} className="bg-primary text-white font-bold px-4 rounded text-sm hover:bg-red-500 transition-colors">+</button>
                </div>
              </section>

              {/* ═══════════════════════════════════════════ */}
              {/* STEP 3: SORTEO + INICIO                     */}
              {/* ═══════════════════════════════════════════ */}
              <section className="bg-background border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">③ Sorteo e Inicio</h3>
                
                {!canStart && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-xs text-yellow-400">
                    <p className="font-bold mb-1">⚠ Requisitos pendientes:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {!paramsReady && <li>Configura y guarda los parámetros (paso ①)</li>}
                      {!judgesReady && <li>Agrega al menos {editParams.judgesCount || 0} jueces (paso ②)</li>}
                      {totalParticipants === 0 && <li>Importa participantes desde Google Sheets</li>}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={() => randomizeGroups(activeCat.id)}
                    disabled={!canStart}
                    className="bg-blue-600/20 border-2 border-blue-600 text-blue-400 font-bold p-3 rounded-xl hover:bg-blue-600 hover:text-white flex-1 transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                    🎲 Realizar Sorteo
                  </button>
                  <button onClick={() => startTournament(activeCat.id)}
                    disabled={!canStart || activeCat.rounds?.[0]?.status === 'completed'}
                    className="bg-green-600 text-white font-bold p-3 rounded-xl hover:bg-green-500 flex-[2] uppercase tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                    {isThisCatLive && state?.activeRoundId === activeCat.rounds?.[0]?.id 
                      ? "▶ Clasificaciones Iniciadas" 
                      : activeCat.rounds?.[0]?.status === 'completed' 
                        ? "Clasificaciones Finalizadas" 
                        : "▶ Inicio Clasificaciones"}
                  </button>
                </div>
              </section>

              {/* ── GRUPOS PREVIEW ── */}
              {activeCat.rounds?.length > 0 && activeCat.rounds[activeCat.rounds.length - 1].groups?.length > 0 && (
                <section className="bg-background border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">
                    📋 Grupos {activeCat.rounds.length === 1 ? "(Clasificaciones)" : "(Finales)"}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeCat.rounds[activeCat.rounds.length - 1].groups.map((g: any) => (
                      <div key={g.id} className="bg-surface rounded-lg p-3">
                        <span className="text-primary text-xs font-bold uppercase block mb-2">{g.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {g.participants?.map((gp: any) => (
                            <span key={gp.participant.id} className="bg-background text-gray-300 text-xs px-2 py-1 rounded border border-border">
                              {gp.participant.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── CONTROL EN VIVO ── */}
              {isThisCatLive && (
                <section className="bg-background border-2 border-green-600/30 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-green-400 uppercase">🎮 Control en Vivo</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                    <div className="bg-surface p-2 rounded-lg">
                      <span className="text-[10px] text-gray-500 block uppercase">Fase</span>
                      <span className="text-primary font-bold text-xs uppercase">{state?.status?.replace(/_/g, ' ') || '—'}</span>
                    </div>
                    <div className="bg-surface p-2 rounded-lg">
                      <span className="text-[10px] text-gray-500 block uppercase">Grupo</span>
                      <span className="text-white font-bold text-xs">{state?.activeGroupName || '—'}</span>
                    </div>
                    <div className="bg-surface p-2 rounded-lg">
                      <span className="text-[10px] text-gray-500 block uppercase">Pasada</span>
                      <span className="text-white font-bold text-xs">{state?.activePasadaNumber || 0} / {state?.totalPasadas || 0}</span>
                    </div>
                    <div className="bg-surface p-2 rounded-lg">
                      <span className="text-[10px] text-gray-500 block uppercase">Consenso</span>
                      <span className="text-white font-bold text-xs">{state?.consensus?.endPasada?.length || 0}/{state?.judgesRequired || 0}</span>
                    </div>
                  </div>

                  {state?.status === "pasada_activa" && state?.groupParticipants?.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Participantes en el Spot</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {state.groupParticipants.map((p: any) => (
                          <button key={p.id} onClick={() => setActiveParticipant(p.id)}
                            className={`p-2.5 rounded-lg text-xs font-bold transition-all ${
                              state.activeParticipantId === p.id 
                                ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]' 
                                : 'bg-surface text-gray-400 hover:bg-gray-800 border border-border'
                            }`}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={forceClosePasada} className="flex-1 bg-red-900/30 text-red-400 font-bold py-2 rounded-lg hover:bg-red-900 text-xs border border-red-900/50">
                      Forzar Cierre Pasada
                    </button>
                    <button onClick={forceNextGroup} className="flex-1 bg-red-900/30 text-red-400 font-bold py-2 rounded-lg hover:bg-red-900 text-xs border border-red-900/50">
                      Forzar Siguiente Grupo
                    </button>
                  </div>
                </section>
              )}

              {/* ── RESULTADOS ── */}
              {(pasadaResults || classification) && (
                <section className="bg-background border border-border rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase">📊 Resultados</h3>

                  {pasadaResults && (
                    <div>
                      <h4 className="text-xs text-gray-400 font-bold mb-2">Última Pasada ({pasadaResults.pasadaNumber})</h4>
                      {pasadaResults.ranking?.map((r: any) => (
                        <div key={r.participantId} className="flex justify-between py-1.5 border-b border-border last:border-0 text-sm">
                          <span className="text-gray-300"><span className="text-primary font-bold mr-2">#{r.position}</span>{r.name}</span>
                          <span className="text-white font-bold">{r.totalScore} pts</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {classification && (
                    <div className="border-t border-border pt-4">
                      {classification.roundNumber >= 2 ? (
                        <div className="text-center">
                          <h4 className="text-2xl font-black text-white uppercase mb-6">🏆 Podio Final — {classification.categoryName}</h4>
                          <div className="flex justify-center items-end gap-3 mb-6">
                            {classification.qualified?.[1] && (
                              <div className="flex flex-col items-center">
                                <span className="text-3xl mb-2">🥈</span>
                                <div className="bg-gray-500/20 border-2 border-gray-400 rounded-xl p-3 w-28">
                                  <span className="text-white font-black text-sm block">{classification.qualified[1].name}</span>
                                  <span className="text-gray-400 text-xs font-bold">{classification.qualified[1].totalScore} pts</span>
                                </div>
                                <div className="bg-gray-600 w-28 h-16 rounded-b-lg flex items-center justify-center">
                                  <span className="text-white font-black text-2xl">2°</span>
                                </div>
                              </div>
                            )}
                            {classification.qualified?.[0] && (
                              <div className="flex flex-col items-center">
                                <span className="text-4xl mb-2">🥇</span>
                                <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-xl p-3 w-32 shadow-lg shadow-yellow-500/20">
                                  <span className="text-white font-black text-base block">{classification.qualified[0].name}</span>
                                  <span className="text-yellow-400 text-xs font-bold">{classification.qualified[0].totalScore} pts</span>
                                </div>
                                <div className="bg-yellow-600 w-32 h-24 rounded-b-lg flex items-center justify-center">
                                  <span className="text-white font-black text-3xl">1°</span>
                                </div>
                              </div>
                            )}
                            {classification.qualified?.[2] && (
                              <div className="flex flex-col items-center">
                                <span className="text-3xl mb-2">🥉</span>
                                <div className="bg-orange-500/20 border-2 border-orange-600 rounded-xl p-3 w-28">
                                  <span className="text-white font-black text-sm block">{classification.qualified[2].name}</span>
                                  <span className="text-orange-400 text-xs font-bold">{classification.qualified[2].totalScore} pts</span>
                                </div>
                                <div className="bg-orange-700 w-28 h-12 rounded-b-lg flex items-center justify-center">
                                  <span className="text-white font-black text-2xl">3°</span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-left mt-4">
                            <h5 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Ranking Completo</h5>
                            {[...classification.qualified, ...classification.eliminated]?.map((r: any, i: number) => (
                              <div key={r.participantId} className={`flex justify-between py-1.5 text-xs border-b border-border/50 last:border-0 ${i < 3 ? 'text-yellow-300' : 'text-gray-400'}`}>
                                <span>#{r.globalPosition} {r.name}</span>
                                <span className="text-white font-bold">{r.totalScore} pts</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <h4 className="text-xs text-green-400 font-bold uppercase mb-2">
                            Clasificación (Top {Math.round(classification.qualifyPercent * 100)}%)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div>
                              <span className="text-[10px] text-green-400 font-bold block mb-1">✅ Clasificados ({classification.qualified?.length})</span>
                              {classification.qualified?.map((r: any) => (
                                <div key={r.participantId} className="flex justify-between py-1 text-xs">
                                  <span className="text-green-300">#{r.globalPosition} {r.name}</span>
                                  <span className="text-white font-bold">{r.totalScore}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <span className="text-[10px] text-red-400 font-bold block mb-1">❌ Eliminados ({classification.eliminated?.length})</span>
                              {classification.eliminated?.map((r: any) => (
                                <div key={r.participantId} className="flex justify-between py-1 text-xs">
                                  <span className="text-red-300/50">#{r.globalPosition} {r.name}</span>
                                  <span className="text-gray-500">{r.totalScore}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* ── PREPARACIÓN DE FINALES ── */}
                          <div className="mt-8 pt-6 border-t border-border">
                            <h3 className="text-sm font-bold text-yellow-500 uppercase mb-4 text-center tracking-widest">🏆 Preparación de Finales</h3>
                            
                            <div className="bg-surface border border-border rounded-xl p-4 mb-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-gray-400 uppercase">Ajustar Parámetros Final</span>
                                <button onClick={() => saveParams(activeCat.id)}
                                  className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded text-[10px] uppercase transition-colors hover:bg-blue-500">
                                  Guardar
                                </button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="text-center">
                                  <label className="text-[9px] text-gray-500 uppercase font-bold">N° Pasadas</label>
                                  <input type="number" min={1} value={editParams.pasadasCount ?? 0} onChange={e => setEditParams(prev => ({ ...prev, pasadasCount: parseInt(e.target.value) || 0 }))} className="w-full bg-background mt-1 text-white text-sm text-center p-1.5 rounded border border-border focus:border-primary focus:outline-none" />
                                </div>
                                <div className="text-center">
                                  <label className="text-[9px] text-gray-500 uppercase font-bold">Tam. Grupo</label>
                                  <input type="number" min={1} value={editParams.groupSize ?? 0} onChange={e => setEditParams(prev => ({ ...prev, groupSize: parseInt(e.target.value) || 0 }))} className="w-full bg-background mt-1 text-white text-sm text-center p-1.5 rounded border border-border focus:border-primary focus:outline-none" />
                                </div>
                                <div className="text-center">
                                  <label className="text-[9px] text-gray-500 uppercase font-bold">% Clasifican</label>
                                  <input type="number" min={0} value={editParams.qualifyPercent ?? 0} onChange={e => setEditParams(prev => ({ ...prev, qualifyPercent: parseInt(e.target.value) || 0 }))} className="w-full bg-background mt-1 text-white text-sm text-center p-1.5 rounded border border-border focus:border-primary focus:outline-none" />
                                </div>
                                <div className="text-center">
                                  <label className="text-[9px] text-gray-500 uppercase font-bold">N° Jueces</label>
                                  <input type="number" min={1} value={editParams.judgesCount ?? 0} onChange={e => setEditParams(prev => ({ ...prev, judgesCount: parseInt(e.target.value) || 0 }))} className="w-full bg-background mt-1 text-white text-sm text-center p-1.5 rounded border border-border focus:border-primary focus:outline-none" />
                                </div>
                              </div>
                            </div>

                            <button onClick={() => generateNextRound(classification.qualified.map((q: any) => q.participantId))}
                              disabled={activeCat.rounds?.length >= 2}
                              className="w-full bg-blue-600 border-2 border-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 uppercase text-sm disabled:opacity-30 disabled:cursor-not-allowed mb-3">
                              {activeCat.rounds?.length >= 2 ? "✅ Grupos de Final Generados (Arriba)" : "🎲 Añadir y Sortear Finales"}
                            </button>

                            {activeCat.rounds?.length >= 2 && (
                              <button onClick={() => startTournament(activeCat.id)}
                                disabled={state?.activeRoundId === activeCat.rounds[1].id}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-500 uppercase text-sm disabled:opacity-50 tracking-wider shadow-lg shadow-green-600/20">
                                {state?.activeRoundId === activeCat.rounds[1].id ? "🏆 Finales Iniciadas" : "▶ Iniciar Finales Oficialmente"}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
