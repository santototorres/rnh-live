"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import Papa from "papaparse";

export default function AdminView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);

  const [sheetUrl, setSheetUrl] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [structure, setStructure] = useState<any>(null);

  const fetchStructure = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/rnh/api";
      const res = await fetch(`${apiUrl}/admin/structure`);
      if (res.ok) {
        setStructure(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStructure();
  }, []);

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

  const handleSyncGoogleSheets = async () => {
    setIsSyncing(true);
    try {
      // Intenta extraer el Document ID en caso de que pegaran toda la URL
      let docId = sheetUrl;
      const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match && match[1]) {
        docId = match[1];
      }
      
      const csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;

      // Fetch the CSV text directly from Google Docs
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error("No se pudo descargar de Google Sheets. Verifica que el enlace sea 'Público/Cualquier persona con el enlace'");
      
      const csvText = await response.text();

      // Pase the text via PapaParse
      Papa.parse(csvText, {
        complete: async (results) => {
          try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/rnh/api";
            const response = await fetch(`${apiUrl}/admin/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participants: results.data, groupSize: 4 })
            });
            const data = await response.json();
            
            if (response.ok) {
              alert(`¡Éxito! ${data.totalParticipants} skaters cargados y divididos en ${data.totalGroups} Heats.`);
              fetchStructure();
            } else {
              alert(`Error: ${data.error}`);
            }
          } catch (err) {
            console.error(err);
            alert("Error conectando con el servidor");
          } finally {
            setIsSyncing(false);
            setSheetUrl("");
          }
        },
        header: true,
        skipEmptyLines: true,
      });
    } catch (err: any) {
      alert("Error general: " + err.message);
      setIsSyncing(false);
    }
  };

  const forceStateChange = (action: string, extraData: any = {}) => {
    if (!socket) return;
    socket.emit("admin_command", { action, ...extraData });
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-surface min-h-screen">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-white">Centro de Control</h1>
          <p className="text-gray-400 font-mono">Admin</p>
        </div>
        <div className={`px-4 py-2 rounded-lg font-bold text-sm ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
          WS: {connected ? "Conectado" : "Desconectado"}
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* State Control */}
        <div className="bg-background border border-border p-6 rounded-xl">
          <h2 className="text-xl font-bold text-white mb-6 uppercase border-l-4 border-primary pl-3">Estado del Sistema</h2>
          
          <div className="mb-6 p-4 bg-surface rounded-lg">
            <span className="text-sm font-mono text-gray-500">FASE ACTUAL:</span>
            <div className="text-2xl font-bold text-primary uppercase">
              {systemState?.status || "DESCONOCIDA"}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => forceStateChange('start_tournament')} className="rnh-button p-4 rounded-lg">
              INICIAR TORNEO
            </button>
            <button onClick={() => forceStateChange('next_participant')} className="border border-primary text-primary hover:bg-primary hover:text-white p-4 rounded-lg font-bold transition-colors">
              SIGUIENTE PARTICIPANTE
            </button>
            <button onClick={() => forceStateChange('force_close')} className="bg-red-900 text-white hover:bg-red-800 p-4 rounded-lg font-bold transition-colors">
              FORZAR CIERRE DE PASADA
            </button>
          </div>
        </div>

        {/* Data Loading */}
        <div className="bg-background border border-border p-6 rounded-xl">
          <h2 className="text-xl font-bold text-white mb-6 uppercase border-l-4 border-primary pl-3">Participantes</h2>
          <p className="text-gray-400 text-sm mb-4">Ingresa el enlace público de tu tabla de Google Sheets. Estaremos usando su exportación directa sin API complejas.</p>
          
          <div className="flex flex-col gap-3">
            <input 
               type="text" 
               placeholder="https://docs.google.com/spreadsheets/d/..."
               value={sheetUrl}
               onChange={(e) => setSheetUrl(e.target.value)}
               className="w-full bg-surface border border-border rounded-lg p-3 text-white focus:border-primary focus:outline-none"
            />
            <button 
              onClick={handleSyncGoogleSheets} 
              disabled={isSyncing || !sheetUrl}
              className={`font-bold p-3 rounded-lg transition-colors ${
                isSyncing || !sheetUrl ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              {isSyncing ? "Sincronizando..." : "Sincronizar desde Google Sheets"}
            </button>
            <button 
              onClick={fetchStructure}
              className="mt-2 text-sm text-gray-400 hover:text-white underline text-left"
            >
              ⟳ Actualizar Lista de Grupos
            </button>
          </div>
        </div>
      </div>

      {/* Paginador de Torneo */}
      <div className="mt-8 bg-background border border-border p-6 rounded-xl">
        <h2 className="text-xl font-bold text-white mb-6 uppercase border-l-4 border-primary pl-3">Control de Ronda (Heats)</h2>
        
        {!structure ? (
          <p className="text-gray-500 italic">No hay estructura cargada. Sincroniza participantes primero.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {structure.categories?.map((cat: any) => (
              <div key={cat.id} className="bg-surface p-4 rounded-xl border border-gray-800">
                <h3 className="text-lg font-black text-white mb-4 uppercase text-primary">{cat.name}</h3>
                
                {cat.rounds?.[0]?.groups?.map((group: any) => (
                  <div key={group.id} className="mb-4 ml-4">
                    <h4 className="text-white font-bold mb-2">{group.name}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {group.participants?.map((gp: any) => {
                        const p = gp.participant;
                        const isActive = systemState?.activeParticipantId === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => forceStateChange('set_active_participant', {
                              participantId: p.id,
                              participantName: `${p.name} (${cat.name})`,
                              roundId: cat.rounds[0].id
                            })}
                            className={`p-3 rounded flex items-center justify-between transition-all ${
                              isActive 
                                ? 'bg-primary text-white font-bold border border-red-500 shadow-lg shadow-primary/20 scale-105' 
                                : 'bg-black text-gray-400 hover:bg-gray-900 border border-gray-800'
                            }`}
                          >
                            <span className="truncate">{p.name}</span>
                            {isActive && <span className="text-xs absolute -top-2 -right-2 bg-white text-black px-2 py-1 rounded-full animate-pulse">EN PISTA</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
