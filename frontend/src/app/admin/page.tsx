"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";

export default function AdminView() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState<any>(null);
  const [structure, setStructure] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Judge creation
  const [newJudgeName, setNewJudgeName] = useState("");
  const [newJudgePin, setNewJudgePin] = useState("");

  // Sidebar
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tab per category: 'clasificacion' | 'finales'
  const [catTabs, setCatTabs] = useState<Record<string, "clasificacion" | "finales">>({});

  // Editable params (local state before saving)
  const [editParams, setEditParams] = useState<Record<string, any>>({});

  // Results (from socket)
  const [pasadaResults, setPasadaResults] = useState<any>(null);
  const [classification, setClassification] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/rnh/api";

  const fetchStructure = async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/structure`);
      if (res.ok) {
        const data = await res.json();
        setStructure(data);
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
        qualifyCount: cat.qualifyCount
      });
    }
  }, [selectedCatId, structure]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("request_state");

    socket.on("state_update", (s) => setState(s));
    socket.on("pasada_results", (d) => setPasadaResults(d));
    socket.on("round_classification", (d) => setClassification(d));
    socket.on("force_structure_refresh", () => fetchStructure());

    return () => {
      socket.off("state_update");
      socket.off("pasada_results");
      socket.off("round_classification");
      socket.off("force_structure_refresh");
    };
  }, [socket]);

  // ── Google Sheets Sync ──
  const handleSync = async () => {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLVC-7KTW8mhUZiiyR7fvTfYEZ3S6AP7jkmC4_2S-SpK-NCQF6DpT4NWERQO8rGIBZ0dkaSiYhXK1E/pubhtml";
    setIsSyncing(true);
    try {
      const proxyRes = await fetch('/rnh/sheetApi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl })
      });
      const proxyText = await proxyRes.text();
      let proxyData: any;
      try { proxyData = JSON.parse(proxyText); } catch(e) { throw new Error("Proxy devolvió inválido: " + proxyText.substring(0, 80)); }
      if (!proxyRes.ok) throw new Error(proxyData.error || "Fallo en el proxy interno");

      const res = await fetch(`${apiUrl}/admin/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: proxyData.participants })
      });
      const textResponse = await res.text();
      let data: any;
      try { data = JSON.parse(textResponse); } catch(e) { throw new Error("Backend devolvió inválido: " + textResponse.substring(0, 80)); }

      if (res.ok) {
        alert(`✅ ${data.totalParticipants} rollers importados en ${data.totalGroups} grupos`);
        fetchStructure();
      } else {
        alert(`Error: ${data.error || 'Desconocido'}`);
      }
    } catch (err: any) {
      alert("Error de conexión: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Save params ──
  const saveParams = async (catId: string) => {
    try {
      const cat = structure?.categories?.find((c: any) => c.id === catId);
      await fetch(`${apiUrl}/admin/category/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pasadasCount: editParams.pasadasCount,
          groupSize: editParams.groupSize,
          qualifyCount: editParams.qualifyCount
        })
      });
      socket?.emit('admin_category_configured', {
        categoryName: cat?.name || '',
        pasadasCount: editParams.pasadasCount,
        groupSize: editParams.groupSize,
        qualifyCount: editParams.qualifyCount,
        judgesCount: structure?.judges?.length || 0,
        phase: activeTab === 'finales' ? 'Finales' : 'Clasificaciones'
      });
      alert("✅ Parámetros guardados");
      fetchStructure();
    } catch { alert("Error al guardar"); }
  };

  // ── Judge CRUD ──
  const createJudge = async () => {
    if (!newJudgeName || !newJudgePin || !structure?.id) return;
    const res = await fetch(`${apiUrl}/admin/judges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newJudgeName, pin: newJudgePin, tournamentId: structure.id })
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
      if (res.ok) {
        const data = await res.json();
        const cat = structure?.categories?.find((c: any) => c.id === catId);
        // Emit with full group data for live screen
        socket?.emit('admin_raffle_done', {
          type: 'clasificaciones',
          categoryName: cat?.name || '',
          groups: data.groups
        });
        fetchStructure();
      } else alert("Error al realizar el sorteo");
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
    if (!confirm("⚠️ ¿Limpiar TODOS los datos de competencia de esta categoría?")) return;
    try {
      const res = await fetch(`${apiUrl}/admin/category/${catId}/reset`, { method: 'POST' });
      if (res.ok) fetchStructure();
      else alert("Error al reiniciar la categoría");
    } catch { alert("Error de conexión"); }
  };

  const generateNextRound = (qualifiedIds: string[]) => {
    if (!selectedCatId) return;
    socket?.emit("admin_generate_next_round", { qualifiedIds, categoryId: selectedCatId });
    // Also refresh structure after a short delay
    setTimeout(() => fetchStructure(), 1500);
  };

  // ── Derived state ──
  const categories = structure?.categories || [];
  const activeCat = categories.find((c: any) => c.id === selectedCatId);
  const isThisCatLive = state?.activeCategoryId === selectedCatId;
  const activeTab = selectedCatId ? (catTabs[selectedCatId] || "clasificacion") : "clasificacion";

  const setTab = (tab: "clasificacion" | "finales") => {
    if (!selectedCatId) return;
    setCatTabs(prev => ({ ...prev, [selectedCatId]: tab }));
  };

  // Counts
  const totalParticipants = activeCat?.participants?.length || 0;
  const round1 = activeCat?.rounds?.[0];
  const round2 = activeCat?.rounds?.[1];
  const totalGroups1 = round1?.groups?.length || 0;
  const totalJudges = structure?.judges?.length || 0;

  const paramsReady = (editParams.pasadasCount || 0) > 0 && (editParams.groupSize || 0) > 0 && (editParams.qualifyCount || 0) > 0;
  const judgesReady = totalJudges > 0;
  const canStart = paramsReady && judgesReady && totalParticipants > 0 && totalGroups1 > 0;

  const classificationDone = activeCat?.rounds?.[0]?.status === 'completed';
  const hasFinalsRound = (activeCat?.rounds?.length || 0) >= 2;
  const finalsLive = state?.activeCategoryId === selectedCatId && state?.activeRoundId === round2?.id;

  // ── RENDER ──
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
          <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Google Sheets</label>
          <button onClick={handleSync} disabled={isSyncing}
            className="w-full bg-[#0f9d58] text-white font-bold px-3 py-2 rounded text-[11px] disabled:opacity-50 hover:bg-[#0b8043] transition flex items-center justify-center gap-2">
            {isSyncing ? "⟳ Actualizando..." : "↻ Sincronizar Participantes"}
          </button>
        </div>

        {/* Global Judges */}
        <div className="p-3 border-b border-border">
          <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2">📋 Jueces Globales</label>
          <div className="flex flex-col gap-2 mb-2 max-h-28 overflow-y-auto">
            {structure?.judges?.map((j: any) => (
              <div key={j.id} className="flex justify-between items-center bg-surface p-2 rounded text-xs border border-border">
                <span><span className="font-bold">{j.name}</span> <span className="text-gray-500 ml-1">({j.pin})</span></span>
                <button onClick={() => deleteJudge(j.id)} className="text-red-500 hover:text-red-300">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            <input type="text" placeholder="Nombre" value={newJudgeName} onChange={e => setNewJudgeName(e.target.value)}
              className="w-[45%] bg-surface border border-border rounded px-2 py-1 text-white text-[10px] focus:outline-none focus:border-primary" />
            <input type="text" placeholder="PIN" value={newJudgePin} onChange={e => setNewJudgePin(e.target.value)}
              className="w-[35%] bg-surface border border-border rounded px-2 py-1 text-white text-[10px] text-center focus:outline-none focus:border-primary" />
            <button onClick={createJudge} className="w-[20%] bg-primary text-white font-bold rounded text-[11px]">+</button>
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
            const pCount = cat.participants?.length || 0;
            const gCount = cat.rounds?.[0]?.groups?.length || 0;
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
                <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                  <span>👥 {pCount} part.</span>
                  <span>📋 {gCount} grupos</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-border">
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
            <div className="max-w-4xl mx-auto space-y-4">

              {/* ── HEADER ── */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase">{activeCat.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {totalParticipants} participantes · {totalGroups1} grupos
                    {isThisCatLive && <span className="ml-2 text-green-400 font-bold">● EN VIVO</span>}
                  </p>
                </div>
                <button onClick={() => resetCategory(activeCat.id)}
                  className="bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">
                  🔄 Reiniciar
                </button>
              </div>

              {/* ── TABS ── */}
              <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
                <button
                  onClick={() => setTab("clasificacion")}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === "clasificacion"
                      ? "bg-primary text-white shadow"
                      : "text-gray-500 hover:text-white"
                  }`}>
                  🎯 Clasificación
                </button>
                <button
                  onClick={() => setTab("finales")}
                  disabled={!classificationDone && !hasFinalsRound}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === "finales"
                      ? "bg-yellow-500 text-black shadow"
                      : classificationDone || hasFinalsRound
                        ? "text-gray-400 hover:text-white"
                        : "text-gray-700 cursor-not-allowed"
                  }`}>
                  🏆 Finales
                  {!classificationDone && !hasFinalsRound && <span className="ml-1 text-[10px]">(bloqueado)</span>}
                </button>
              </div>

              {/* ══════════════════════════════════════ */}
              {/* TAB CLASIFICACIÓN                       */}
              {/* ══════════════════════════════════════ */}
              {activeTab === "clasificacion" && (
                <div className="space-y-4">

                  {/* 1. Parametrización */}
                  <section className="bg-background border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-400 uppercase">① Parametrización</h3>
                      <button onClick={() => saveParams(activeCat.id)}
                        className="bg-blue-600 text-white font-bold px-5 py-2 rounded-lg hover:bg-blue-500 text-xs uppercase tracking-wider transition-colors">
                        💾 Guardar
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'pasadasCount', label: 'N° Pasadas', max: 10 },
                        { key: 'groupSize', label: 'Por Grupo', max: 20 },
                        { key: 'qualifyCount', label: 'Clasifican', max: 100 },
                      ].map(({ key, label, max }) => (
                        <div key={key} className="bg-surface p-4 rounded-lg text-center">
                          <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">{label}</label>
                          <input type="number" value={editParams[key] ?? 0} min={0} max={max}
                            onChange={e => setEditParams(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                        </div>
                      ))}
                    </div>
                    {!paramsReady && (
                      <p className="text-yellow-500 text-xs mt-3 font-bold">⚠ Todos los parámetros deben ser mayores a 0.</p>
                    )}
                  </section>

                  {/* 2. Sorteo */}
                  <section className="bg-background border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">② Sorteo</h3>
                    {!canStart && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3 text-xs text-yellow-400">
                        <p className="font-bold mb-1">⚠ Requisitos pendientes:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {!paramsReady && <li>Configura y guarda los parámetros (paso ①)</li>}
                          {!judgesReady && <li>Agrega al menos 1 juez en el panel lateral</li>}
                          {totalParticipants === 0 && <li>Importa participantes desde Google Sheets</li>}
                        </ul>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => randomizeGroups(activeCat.id)}
                        disabled={!paramsReady || totalParticipants === 0}
                        className="flex-1 bg-blue-600/20 border-2 border-blue-600 text-blue-400 font-bold p-3 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                        🎲 Realizar Sorteo
                      </button>
                      <button onClick={() => startTournament(activeCat.id)}
                        disabled={!canStart || round1?.status === 'completed'}
                        className="flex-[2] bg-green-600 text-white font-bold p-3 rounded-xl hover:bg-green-500 uppercase tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                        {isThisCatLive && state?.activeRoundId === round1?.id
                          ? "▶ Clasificaciones Iniciadas"
                          : round1?.status === 'completed'
                            ? "✅ Clasificaciones Finalizadas"
                            : "▶ Iniciar Clasificaciones"}
                      </button>
                    </div>
                  </section>

                  {/* 3. Grupos */}
                  {round1?.groups?.length > 0 && (
                    <section className="bg-background border border-border rounded-xl p-5">
                      <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">③ Grupos de Clasificación</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {round1.groups.map((g: any) => (
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

                  {/* 4. Control en Vivo */}
                  {isThisCatLive && state?.activeRoundId === round1?.id && (
                    <section className="bg-background border-2 border-green-600/30 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-green-400 uppercase">④ 🎮 Control en Vivo — Clasificaciones</h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                        {[
                          { label: 'Fase', value: state?.status?.replace(/_/g, ' ') || '—' },
                          { label: 'Grupo', value: state?.activeGroupName || '—' },
                          { label: 'Pasada', value: `${state?.activePasadaNumber || 0} / ${state?.totalPasadas || 0}` },
                          { label: 'Consenso', value: `${state?.consensus?.endPasada?.length || 0}/${state?.judgesRequired || 0}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-surface p-2 rounded-lg">
                            <span className="text-[10px] text-gray-500 block uppercase">{label}</span>
                            <span className="text-white font-bold text-xs">{value}</span>
                          </div>
                        ))}
                      </div>

                      {state?.status === "pasada_activa" && state?.groupParticipants?.length > 0 && (
                        <div>
                          <h4 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Participantes en el Spot — Pasada {state.activePasadaNumber}</h4>
                          <div className="space-y-2">
                            {state.groupParticipants.map((p: any) => {
                              const isSelected = state.activeParticipantId === p.id;
                              return (
                                <div key={p.id} className={`rounded-lg p-3 transition-all ${
                                  isSelected ? 'bg-primary/20 border-2 border-primary' : 'bg-surface border border-border'
                                }`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <button onClick={() => setActiveParticipant(p.id)}
                                      className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-white hover:text-primary'}`}>
                                      {isSelected && "▶ "}{p.name}
                                    </button>
                                  </div>
                                  {/* Judge voting status */}
                                  <div className="flex flex-wrap gap-1">
                                    {(state.judges || []).map((j: any) => {
                                      const hasVoted = (state.scoresThisPasada || []).some(
                                        (s: any) => s.participantId === p.id && s.judgeId === j.id
                                      );
                                      const score = (state.scoresThisPasada || []).find(
                                        (s: any) => s.participantId === p.id && s.judgeId === j.id
                                      );
                                      return (
                                        <span key={j.id} className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                          hasVoted 
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        }`}>
                                          {j.name} {hasVoted ? `✓${score?.value || ''}` : '✗'}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
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

                  {/* 5. Resultados de Clasificación */}
                  {classification && state?.activeRoundId === round1?.id && classification.roundNumber === 1 && (
                    <section className="bg-background border border-border rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-gray-400 uppercase">⑤ Resultados — Clasificación</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] text-green-400 font-bold block mb-2 uppercase">✅ Clasificados ({classification.qualified?.length})</span>
                          {classification.qualified?.map((r: any) => (
                            <div key={r.participantId} className="flex justify-between py-1.5 text-xs border-b border-border/50 last:border-0">
                              <span className="text-green-300">#{r.globalPosition} {r.name}</span>
                              <span className="text-white font-bold">{r.totalScore} pts</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <span className="text-[10px] text-red-400 font-bold block mb-2 uppercase">❌ Eliminados ({classification.eliminated?.length})</span>
                          {classification.eliminated?.map((r: any) => (
                            <div key={r.participantId} className="flex justify-between py-1.5 text-xs border-b border-border/50 last:border-0">
                              <span className="text-red-300/60">#{r.globalPosition} {r.name}</span>
                              <span className="text-gray-500">{r.totalScore} pts</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Acceso a Finales */}
                      {!hasFinalsRound && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-xs text-gray-500 mb-3">Los clasificados pasarán a la pestaña <strong className="text-yellow-400">Finales</strong>. Genera los grupos para continuar:</p>
                          <button onClick={() => generateNextRound(classification.qualified.map((q: any) => q.participantId))}
                            className="w-full bg-yellow-500 text-black font-bold py-3 rounded-xl hover:bg-yellow-400 uppercase text-sm tracking-wider">
                            🏆 Generar Grupos de Finales →
                          </button>
                        </div>
                      )}
                      {hasFinalsRound && (
                        <button onClick={() => setTab("finales")}
                          className="w-full bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 font-bold py-2 rounded-xl text-sm hover:bg-yellow-500/30 transition">
                          Ver Pestaña Finales →
                        </button>
                      )}
                    </section>
                  )}

                  {/* Last pasada results */}
                  {pasadaResults && (
                    <section className="bg-background border border-border rounded-xl p-5">
                      <h3 className="text-xs text-gray-400 font-bold uppercase mb-3">Última Pasada ({pasadaResults.pasadaNumber})</h3>
                      {pasadaResults.ranking?.map((r: any) => (
                        <div key={r.participantId} className="flex justify-between py-1.5 border-b border-border last:border-0 text-sm">
                          <span className="text-gray-300"><span className="text-primary font-bold mr-2">#{r.position}</span>{r.name}</span>
                          <span className="text-white font-bold">{r.totalScore} pts</span>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════ */}
              {/* TAB FINALES                             */}
              {/* ══════════════════════════════════════ */}
              {activeTab === "finales" && (
                <div className="space-y-4">

                  {/* Clasificados que pasan */}
                  {classification && (
                    <section className="bg-background border border-yellow-500/30 rounded-xl p-5">
                      <h3 className="text-sm font-bold text-yellow-400 uppercase mb-3">① Clasificados para Finales</h3>
                      <div className="flex flex-wrap gap-2">
                        {classification.qualified?.map((r: any, i: number) => (
                          <div key={r.participantId} className="bg-yellow-500/10 border border-yellow-500/30 px-3 py-1.5 rounded-lg text-xs">
                            <span className="text-yellow-400 font-bold mr-1">#{i + 1}</span>
                            <span className="text-white">{r.name}</span>
                            <span className="text-gray-500 ml-1">{r.totalScore}pts</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Parametrización Finales */}
                  <section className="bg-background border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-400 uppercase">② Parametrización Final</h3>
                      <button onClick={() => saveParams(activeCat.id)}
                        className="bg-blue-600 text-white font-bold px-5 py-2 rounded-lg hover:bg-blue-500 text-xs uppercase tracking-wider transition-colors">
                        💾 Guardar
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'pasadasCount', label: 'N° Pasadas', max: 10 },
                        { key: 'groupSize', label: 'Por Grupo', max: 20 },
                        { key: 'qualifyCount', label: 'Clasifican', max: 100 },
                      ].map(({ key, label, max }) => (
                        <div key={key} className="bg-surface p-4 rounded-lg text-center">
                          <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">{label}</label>
                          <input type="number" value={editParams[key] ?? 0} min={0} max={max}
                            onChange={e => setEditParams(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-transparent text-white font-black text-2xl text-center focus:outline-none border-b-2 border-border focus:border-primary transition-colors" />
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Sorteo Finales */}
                  <section className="bg-background border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">③ Sorteo Finales</h3>
                    {!hasFinalsRound ? (
                      <button onClick={() => classification && generateNextRound(classification.qualified.map((q: any) => q.participantId))}
                        className="w-full bg-yellow-500 text-black font-bold py-3 rounded-xl hover:bg-yellow-400 uppercase text-sm tracking-wider">
                        🎲 Generar y Sortear Finales
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => randomizeGroups(activeCat.id)}
                          className="flex-1 bg-blue-600/20 border-2 border-blue-600 text-blue-400 font-bold p-3 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-sm">
                          🎲 Re-sortear Finales
                        </button>
                        <button onClick={() => startTournament(activeCat.id)}
                          disabled={finalsLive || round2?.status === 'completed'}
                          className="flex-[2] bg-green-600 text-white font-bold p-3 rounded-xl hover:bg-green-500 uppercase tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed">
                          {finalsLive ? "▶ Finales Iniciadas" : round2?.status === 'completed' ? "✅ Finales Completadas" : "▶ Iniciar Finales"}
                        </button>
                      </div>
                    )}
                  </section>

                  {/* Grupos Finales */}
                  {round2?.groups?.length > 0 && (
                    <section className="bg-background border border-border rounded-xl p-5">
                      <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">④ Grupos Finales</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {round2.groups.map((g: any) => (
                          <div key={g.id} className="bg-surface rounded-lg p-3">
                            <span className="text-yellow-400 text-xs font-bold uppercase block mb-2">{g.name}</span>
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

                  {/* Control en Vivo — Finales */}
                  {finalsLive && (
                    <section className="bg-background border-2 border-yellow-500/30 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-yellow-400 uppercase">⑤ 🎮 Control en Vivo — Finales</h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                        {[
                          { label: 'Fase', value: state?.status?.replace(/_/g, ' ') || '—' },
                          { label: 'Grupo', value: state?.activeGroupName || '—' },
                          { label: 'Pasada', value: `${state?.activePasadaNumber || 0} / ${state?.totalPasadas || 0}` },
                          { label: 'Consenso', value: `${state?.consensus?.endPasada?.length || 0}/${state?.judgesRequired || 0}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-surface p-2 rounded-lg">
                            <span className="text-[10px] text-gray-500 block uppercase">{label}</span>
                            <span className="text-white font-bold text-xs">{value}</span>
                          </div>
                        ))}
                      </div>

                      {state?.status === "pasada_activa" && state?.groupParticipants?.length > 0 && (
                        <div>
                          <h4 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Participantes en el Spot — Pasada {state.activePasadaNumber}</h4>
                          <div className="space-y-2">
                            {state.groupParticipants.map((p: any) => {
                              const isSelected = state.activeParticipantId === p.id;
                              return (
                                <div key={p.id} className={`rounded-lg p-3 transition-all ${
                                  isSelected ? 'bg-yellow-500/20 border-2 border-yellow-500' : 'bg-surface border border-border'
                                }`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <button onClick={() => setActiveParticipant(p.id)}
                                      className={`text-sm font-bold ${isSelected ? 'text-yellow-400' : 'text-white hover:text-yellow-400'}`}>
                                      {isSelected && "▶ "}{p.name}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {(state.judges || []).map((j: any) => {
                                      const hasVoted = (state.scoresThisPasada || []).some(
                                        (s: any) => s.participantId === p.id && s.judgeId === j.id
                                      );
                                      const score = (state.scoresThisPasada || []).find(
                                        (s: any) => s.participantId === p.id && s.judgeId === j.id
                                      );
                                      return (
                                        <span key={j.id} className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                          hasVoted
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        }`}>
                                          {j.name} {hasVoted ? `✓${score?.value || ''}` : '✗'}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
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

                  {/* Podio Final */}
                  {classification && classification.roundNumber >= 2 && (
                    <section className="bg-background border border-yellow-500/30 rounded-xl p-5">
                      <h3 className="text-sm font-bold text-yellow-400 uppercase mb-4 text-center">⑥ 🏆 Podio Final</h3>
                      <div className="flex justify-center items-end gap-3 mb-6">
                        {/* 2nd */}
                        {classification.qualified?.[1] && (
                          <div className="flex flex-col items-center">
                            <span className="text-3xl mb-2">🥈</span>
                            <div className="bg-gray-500/20 border-2 border-gray-400 rounded-xl p-3 w-28 text-center">
                              <span className="text-white font-black text-sm block">{classification.qualified[1].name}</span>
                              <span className="text-gray-400 text-xs">{classification.qualified[1].totalScore} pts</span>
                            </div>
                            <div className="bg-gray-600 w-28 h-16 rounded-b-lg flex items-center justify-center">
                              <span className="text-white font-black text-2xl">2°</span>
                            </div>
                          </div>
                        )}
                        {/* 1st */}
                        {classification.qualified?.[0] && (
                          <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">🥇</span>
                            <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-xl p-3 w-32 text-center shadow-lg shadow-yellow-500/20">
                              <span className="text-white font-black text-base block">{classification.qualified[0].name}</span>
                              <span className="text-yellow-400 text-xs">{classification.qualified[0].totalScore} pts</span>
                            </div>
                            <div className="bg-yellow-600 w-32 h-24 rounded-b-lg flex items-center justify-center">
                              <span className="text-white font-black text-3xl">1°</span>
                            </div>
                          </div>
                        )}
                        {/* 3rd */}
                        {classification.qualified?.[2] && (
                          <div className="flex flex-col items-center">
                            <span className="text-3xl mb-2">🥉</span>
                            <div className="bg-orange-500/20 border-2 border-orange-600 rounded-xl p-3 w-28 text-center">
                              <span className="text-white font-black text-sm block">{classification.qualified[2].name}</span>
                              <span className="text-orange-400 text-xs">{classification.qualified[2].totalScore} pts</span>
                            </div>
                            <div className="bg-orange-700 w-28 h-12 rounded-b-lg flex items-center justify-center">
                              <span className="text-white font-black text-2xl">3°</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Ranking completo */}
                      <div className="mt-4">
                        <h5 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Ranking Completo</h5>
                        {[...classification.qualified, ...classification.eliminated]?.map((r: any, i: number) => (
                          <div key={r.participantId} className={`flex justify-between py-1.5 text-xs border-b border-border/50 last:border-0 ${i < 3 ? 'text-yellow-300' : 'text-gray-400'}`}>
                            <span>#{r.globalPosition} {r.name}</span>
                            <span className="text-white font-bold">{r.totalScore} pts</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
