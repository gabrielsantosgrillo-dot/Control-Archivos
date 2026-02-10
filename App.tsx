
import React, { useState, useMemo, useEffect } from 'react';
import { 
  FolderOpen, 
  Play, 
  Trash2, 
  Filter, 
  RefreshCw, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  Info
} from 'lucide-react';
import { FileItem, GlobalConfig, FilterState } from './types';
import { formatBytes, getExtension, getBaseName } from './utils/fileUtils';

const App: React.FC = () => {
  // Obtener la fecha actual en formato YYYY-MM-DD para los inputs
  const hoy = new Date().toISOString().split('T')[0];

  const [sourceHandle, setSourceHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [destHandle, setDestHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
    prefix: '',
    suffix: '',
    extension: '',
    overwrite: false
  });
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    dateStart: hoy, // Fecha actual por defecto
    dateEnd: hoy,   // Fecha actual por defecto
    minSize: 0
  });
  const [pastedNames, setPastedNames] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // --- Operaciones del Sistema de Archivos ---

  // Seleccionar directorio de origen
  const selectSource = async () => {
    setPickerError(null);
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error("Tu navegador no soporta la API de archivos necesaria.");
      }
      const handle = await (window as any).showDirectoryPicker();
      setSourceHandle(handle);
      await scanFiles(handle);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'SecurityError') {
        setPickerError("Error de Seguridad: El selector de archivos está bloqueado en este entorno. Prueba a abrir la aplicación en una pestaña nueva o un servidor local.");
      } else {
        setPickerError("No se pudo acceder a la carpeta: " + err.message);
      }
    }
  };

  // Seleccionar directorio de destino
  const selectDestination = async () => {
    setPickerError(null);
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDestHandle(handle);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'SecurityError') {
        setPickerError("Error de Seguridad: El entorno bloquea el acceso a archivos.");
      }
    }
  };

  // Leer archivos del directorio seleccionado
  const scanFiles = async (handle: FileSystemDirectoryHandle) => {
    const newFiles: FileItem[] = [];
    try {
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'file') {
          const file = await (entry as FileSystemFileHandle).getFile();
          const ext = getExtension(file.name);
          const base = getBaseName(file.name);
          
          newFiles.push({
            id: crypto.randomUUID(),
            handle: entry as FileSystemFileHandle,
            originalName: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type,
            customBaseName: base,
            prefix: '',
            suffix: '',
            extension: ext,
            status: 'pending'
          });
        }
      }
      setFiles(newFiles);
    } catch (e: any) {
      setPickerError("Error al leer archivos: " + e.message);
    }
  };

  // --- Lógica para archivos filtrados ---

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = f.originalName.toLowerCase().includes(filters.search.toLowerCase());
      const matchesSize = f.size >= filters.minSize * 1024;
      
      const fileDate = new Date(f.lastModified);
      // Ajustar fechas de filtro para comparación
      const start = filters.dateStart ? new Date(filters.dateStart + 'T00:00:00') : null;
      const end = filters.dateEnd ? new Date(filters.dateEnd + 'T23:59:59') : null;
      
      const matchesDate = (!start || fileDate >= start) && (!end || fileDate <= end);
      
      return matchesSearch && matchesSize && matchesDate;
    });
  }, [files, filters]);

  // --- Operaciones Masivas ---

  // Aplicar nombres desde una lista pegada (mapeo uno a uno)
  const applyPastedNames = () => {
    const names = pastedNames.split('\n').filter(n => n.trim() !== '');
    setFiles(prev => prev.map((f) => {
      const filterIdx = filteredFiles.findIndex(ff => ff.id === f.id);
      if (filterIdx !== -1 && names[filterIdx]) {
        return { ...f, customBaseName: names[filterIdx].trim() };
      }
      return f;
    }));
  };

  // Construir el nombre final
  const getFinalName = (f: FileItem) => {
    const prefix = f.prefix || globalConfig.prefix;
    const suffix = f.suffix || globalConfig.suffix;
    const ext = f.extension || globalConfig.extension || getExtension(f.originalName);
    return `${prefix}${f.customBaseName}${suffix}${ext ? '.' + ext : ''}`;
  };

  // Ejecutar el proceso
  const executeBatch = async () => {
    if (!destHandle) return;
    setIsProcessing(true);
    setShowConfirm(false);

    const updatedFiles = [...files];

    for (const f of filteredFiles) {
      const idx = updatedFiles.findIndex(uf => uf.id === f.id);
      updatedFiles[idx] = { ...updatedFiles[idx], status: 'processing' };
      setFiles([...updatedFiles]);

      try {
        const finalName = getFinalName(f);
        const sourceFile = await f.handle.getFile();
        
        let skip = false;
        try {
          await destHandle.getFileHandle(finalName, { create: false });
          if (!globalConfig.overwrite) {
            updatedFiles[idx] = { ...updatedFiles[idx], status: 'skipped', errorMessage: 'Ya existe' };
            skip = true;
          }
        } catch (e) {}

        if (!skip) {
          const newFileHandle = await destHandle.getFileHandle(finalName, { create: true });
          const writable = await (newFileHandle as any).createWritable();
          await writable.write(sourceFile);
          await writable.close();
          updatedFiles[idx] = { ...updatedFiles[idx], status: 'success' };
        }
      } catch (err: any) {
        updatedFiles[idx] = { ...updatedFiles[idx], status: 'error', errorMessage: err.message };
      }
      setFiles([...updatedFiles]);
    }
    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-7xl mx-auto p-4 lg:p-6 space-y-6 font-sans">
      {/* Encabezado */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-indigo-600 flex items-center gap-2">
            <FolderOpen className="w-8 h-8" />
            GA-Archivos
          </h1>
          <p className="text-slate-500 text-sm font-medium">Gestor Nombres Archivos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={selectSource}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Origen: {sourceHandle?.name || 'No Seleccionado'}
          </button>
          <button 
            onClick={selectDestination}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Destino: {destHandle?.name || 'No Seleccionado'}
          </button>
          <button 
            disabled={filteredFiles.length === 0 || !destHandle || isProcessing}
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-all font-bold shadow-lg shadow-indigo-100"
          >
            <Play className="w-4 h-4" />
            Iniciar Ejecución
          </button>
        </div>
      </header>

      {/* Alerta de Error de Selector */}
      {pickerError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Aviso del Sistema</p>
            <p>{pickerError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 overflow-hidden">
        
        {/* Controles Laterales */}
        <aside className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Configuración por Lote en una sola línea vertical/horizontal combinada */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="font-bold flex items-center gap-2 text-slate-800">
              <RefreshCw className="w-4 h-4 text-indigo-500" />
              Configuración por Lote
            </h2>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[60px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Prefijo</label>
                <input 
                  type="text" 
                  value={globalConfig.prefix}
                  onChange={e => setGlobalConfig(prev => ({...prev, prefix: e.target.value}))}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="IMG_"
                />
              </div>
              <div className="flex-1 min-w-[60px]">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Sufijo</label>
                <input 
                  type="text" 
                  value={globalConfig.suffix}
                  onChange={e => setGlobalConfig(prev => ({...prev, suffix: e.target.value}))}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="_2024"
                />
              </div>
              <div className="w-16">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Ext</label>
                <input 
                  type="text" 
                  value={globalConfig.extension}
                  onChange={e => setGlobalConfig(prev => ({...prev, extension: e.target.value.replace('.', '')}))}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder=".jpg"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer group border-t pt-3">
              <input 
                type="checkbox" 
                checked={globalConfig.overwrite}
                onChange={e => setGlobalConfig(prev => ({...prev, overwrite: e.target.checked}))}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">Permitir Sobrescribir</span>
            </label>
          </section>

          {/* Mapeador de Lista */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="font-bold flex items-center gap-2 text-slate-800">
              <FileText className="w-4 h-4 text-indigo-500" />
              Mapeador de Lista
            </h2>
            <textarea 
              value={pastedNames}
              onChange={e => setPastedNames(e.target.value)}
              className="w-full h-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none font-mono"
              placeholder="Nombre 1&#10;Nombre 2..."
            />
            <button 
              onClick={applyPastedNames}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all border border-slate-200"
            >
              Asignar Nombres
            </button>
          </section>

          {/* Filtros */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="font-bold flex items-center gap-2 text-slate-800">
              <Filter className="w-4 h-4 text-indigo-500" />
              Filtros
            </h2>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Buscar por nombre..."
                value={filters.search}
                onChange={e => setFilters(prev => ({...prev, search: e.target.value}))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Desde</label>
                  <input 
                    type="date" 
                    value={filters.dateStart}
                    onChange={e => setFilters(prev => ({...prev, dateStart: e.target.value}))}
                    className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Hasta</label>
                  <input 
                    type="date" 
                    value={filters.dateEnd}
                    onChange={e => setFilters(prev => ({...prev, dateEnd: e.target.value}))}
                    className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

        </aside>

        {/* Tabla de Archivos */}
        <main className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-600">
              Mostrando: <span className="text-indigo-600">{filteredFiles.length}</span> / {files.length}
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                <CheckCircle className="w-2 h-2" /> {files.filter(f => f.status === 'success').length} OK
              </span>
              <span className="flex items-center gap-1 text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                <XCircle className="w-2 h-2" /> {files.filter(f => f.status === 'error').length} FAIL
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="sticky top-0 bg-white shadow-sm z-10 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-1/4">Original</th>
                  <th className="px-2 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-12">P</th>
                  <th className="px-2 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre Nuevo</th>
                  <th className="px-2 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-12">S</th>
                  <th className="px-2 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-16">Ext</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Previsualización</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredFiles.map(f => (
                  <tr key={f.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900 truncate max-w-[180px]" title={f.originalName}>{f.originalName}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-slate-400 font-mono">{formatBytes(f.size)}</span>
                          {f.status === 'processing' && <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin" />}
                          {f.status === 'success' && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                          {f.status === 'error' && <XCircle className="w-3 h-3 text-rose-500" title={f.errorMessage} />}
                          {f.status === 'skipped' && <AlertTriangle className="w-3 h-3 text-amber-500" title={f.errorMessage} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-4">
                      <input 
                        type="text" 
                        value={f.prefix}
                        placeholder={globalConfig.prefix || '-'}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, prefix: e.target.value} : i))}
                        className="w-full px-1 py-1 text-[10px] bg-slate-50/50 border border-transparent group-hover:border-slate-200 rounded text-center focus:bg-white outline-none"
                      />
                    </td>
                    <td className="px-2 py-4">
                      <input 
                        type="text" 
                        value={f.customBaseName}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, customBaseName: e.target.value} : i))}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-medium text-indigo-700 outline-none"
                      />
                    </td>
                    <td className="px-1 py-4">
                      <input 
                        type="text" 
                        value={f.suffix}
                        placeholder={globalConfig.suffix || '-'}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, suffix: e.target.value} : i))}
                        className="w-full px-1 py-1 text-[10px] bg-slate-50/50 border border-transparent group-hover:border-slate-200 rounded text-center focus:bg-white outline-none"
                      />
                    </td>
                    <td className="px-1 py-4">
                      <input 
                        type="text" 
                        value={f.extension}
                        placeholder={globalConfig.extension || getExtension(f.originalName)}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, extension: e.target.value} : i))}
                        className="w-full px-1 py-1 text-[10px] bg-slate-50/50 border border-transparent group-hover:border-slate-200 rounded text-center focus:bg-white outline-none"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded truncate block max-w-[240px]" title={getFinalName(f)}>
                        {getFinalName(f)}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredFiles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-24 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-4">
                        <Trash2 className="w-12 h-12 text-slate-200" />
                        <p className="text-sm">No hay archivos para mostrar.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* Pie de página */}
      <footer className="text-center py-4 text-slate-400 text-xs space-y-2 border-t mt-4">
        <p>Creado por <span className="font-bold text-slate-600">Gabriel Santos Grillo</span></p>
        <button onClick={() => setShowPrivacy(true)} className="hover:text-indigo-500 flex items-center justify-center gap-1 mx-auto transition-colors">
          <ShieldCheck className="w-3 h-3" /> Política de Privacidad
        </button>
      </footer>

      {/* Modales */}
      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" /> Confirmar Proceso
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl text-sm space-y-2 text-slate-600">
              <p>Archivos a procesar: <span className="font-bold">{filteredFiles.length}</span></p>
              <p>Carpeta destino: <span className="font-mono text-xs">{destHandle?.name}</span></p>
              <p>Sobrescribir: <span className={globalConfig.overwrite ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{globalConfig.overwrite ? 'SÍ' : 'NO'}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold">Cancelar</button>
              <button onClick={executeBatch} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">Iniciar</button>
            </div>
          </div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <h3 className="text-xl font-bold text-slate-900">Política de Privacidad</h3>
              <button onClick={() => setShowPrivacy(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
              <p>GA-Archivos garantiza la privacidad absoluta de tus datos:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Procesamiento Local:</strong> Los archivos no se suben a ningún servidor. Todo ocurre en tu navegador.</li>
                <li><strong>Sin Rastreo:</strong> No recopilamos información personal ni estadísticas de uso.</li>
                <li><strong>Acceso Temporal:</strong> Los permisos de acceso a carpetas son temporales y caducan al cerrar la pestaña.</li>
              </ul>
            </div>
            <button onClick={() => setShowPrivacy(false)} className="w-full py-3 bg-slate-100 rounded-xl font-bold">Entendido</button>
          </div>
        </div>
      )}

      {/* Indicador de Progreso */}
      {isProcessing && (
        <div className="fixed bottom-8 right-8 bg-white p-6 rounded-2xl shadow-2xl border border-slate-200 z-40 w-80 animate-in slide-in-from-bottom-10">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-slate-900 flex items-center gap-2 italic">
              <Clock className="w-4 h-4 text-indigo-500 animate-spin" /> Procesando...
            </h4>
            <span className="text-xs font-mono font-bold text-indigo-600">
              {files.filter(f => f.status !== 'pending' && f.status !== 'processing').length} / {filteredFiles.length}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-indigo-500 h-full transition-all duration-300" 
              style={{ width: `${(files.filter(f => f.status !== 'pending' && f.status !== 'processing').length / filteredFiles.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
