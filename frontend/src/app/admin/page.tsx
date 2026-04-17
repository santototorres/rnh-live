"use client";

import { useSocket } from "@/components/SocketProvider";
import { useEffect, useState } from "react";
import Papa from "papaparse";

export default function AdminView() {
  const { socket, connected } = useSocket();
  const [systemState, setSystemState] = useState<any>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      Papa.parse(e.target.files[0], {
        complete: (results) => {
          console.log("CSV Parsed:", results.data);
          // Here we would send this data to backend via API or Socket
          alert("CSV cargado exitosamente. Revisar consola.");
        },
        header: true,
      });
    }
  };

  const forceStateChange = (action: string) => {
    if (!socket) return;
    socket.emit("admin_command", { action });
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
          <p className="text-gray-400 text-sm mb-4">Carga los participantes desde un archivo CSV. El archivo debe contener al menos las columnas "name", "alias", y "categoryId".</p>
          
          <input 
             type="file" 
             accept=".csv"
             onChange={handleFileUpload}
             className="block w-full text-sm text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-bold
                        file:bg-surface file:text-white
                        hover:file:bg-primary-hover hover:file:text-white transition-colors cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
