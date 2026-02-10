
import React, { useState, useMemo } from 'react';
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
  ExternalLink,
  ArrowUpDown
} from 'lucide-react';
import { FileItem, GlobalConfig, FilterState, SortType } from './types';
import { formatBytes, getExtension, getBaseName } from './utils/fileUtils';

const App: React.FC = () => {
  // Obtener la fecha actual local en formato YYYY-MM-DD
  const hoy = new Date().toLocaleDateString('en-CA'); 

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
    dateStart: hoy, 
    dateEnd: hoy,   
    minSize: 0,
    sort: 'name_asc'
  });
  const [pastedNames, setPastedNames] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [pickerError, setPickerError] = useState<{title: string, msg: string} | null>(null);

  // --- Operaciones del Sistema de Archivos ---

  const selectSource = async () => {
    setPickerError(null);
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error("Navegador incompatible con File System API.");
      }
      const handle = await (window as any).showDirectoryPicker();
      setSourceHandle(handle);
      await scanFiles(handle);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'SecurityError' || err.message.includes('Cross origin')) {
        setPickerError({
          title: "Restricción de Seguridad",
          msg: "El navegador bloquea el acceso a archivos desde un marco (iframe). Por favor, abre esta aplicación en una ventana nueva o directamente desde su URL para poder seleccionar carpetas."
        });
      } else if (err.name !== 'AbortError') {
        setPickerError({
          title: "Error de Acceso",
          msg: err.message
        });
      }
    }
  };

  const selectDestination = async () => {
    setPickerError(null);
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDestHandle(handle);
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.message.includes('Cross origin')) {
        setPickerError({
          title: "Restricción de Seguridad",
          msg: "No se puede abrir el selector en este entorno. Abre la app en una pestaña independiente."
        });
      }
    }
  };

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
      setPickerError({title: "Error de Lectura", msg: e.message});
    }
  };

  // --- Lógica de Filtros y Ordenación ---

  const filteredFiles = useMemo(() => {
    let result = files.filter(f => {
      const matchesSearch = f.originalName.toLowerCase().includes(filters.search.toLowerCase());
      const matchesSize = f.size >= filters.minSize * 1024;
      
      const fileDate = new Date(f.lastModified);
      const start = filters.dateStart ? new Date(filters.dateStart + 'T00:00:00') : null;
      const end = filters.dateEnd ? new Date(filters.dateEnd + 'T23:59:59') : null;
      
      const matchesDate = (!start || fileDate >= start) && (!end || fileDate <= end);
      
      return matchesSearch && matchesSize && matchesDate;
    });

    // Aplicar Ordenación
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'name_asc':
          return a.originalName.localeCompare(b.originalName);
        case 'name_desc':
          return b.originalName.localeCompare(a.originalName);
        case 'date_asc':
          return a.lastModified - b.lastModified;
        case 'date_desc':
          return b.lastModified - a.lastModified;
        case 'size_asc':
          return a.size - b.size;
        case 'size_desc':
          return b.size - a.size;
        default:
          return 0;
      }
    });

    return result;
  }, [files, filters]);

  // --- Operaciones Masivas ---

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

  const getFinalName = (f: FileItem) => {
    const prefix = f.prefix || globalConfig.prefix;
    const suffix = f.suffix || globalConfig.suffix;
    const ext = f.extension || globalConfig.extension || getExtension(f.originalName);
    const dot = (ext && !ext.startsWith('.')) ? '.' : '';
    return `${prefix}${f.customBaseName}${suffix}${dot}${ext}`;
  };

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
    <div className="flex flex-col h-screen max-w-full mx-auto p-4 lg:p-4 space-y-4 font-sans bg-slate-50">
      {/* Encabezado Compacto */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">GA-Archivos</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Gestor Nombres Archivos</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={selectSource}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-semibold text-xs border border-slate-200"
          >
            <FolderOpen className="w-3 h-3" />
            Origen: {sourceHandle?.name || 'Seleccionar'}
          </button>
          <button 
            onClick={selectDestination}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-semibold text-xs border border-slate-200"
          >
            <FolderOpen className="w-3 h-3" />
            Destino: {destHandle?.name || 'Seleccionar'}
          </button>
          <button 
            disabled={filteredFiles.length === 0 || !destHandle || isProcessing}
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-all font-bold text-xs shadow-md shadow-indigo-100"
          >
            <Play className="w-3 h-3" />
            Ejecutar
          </button>
        </div>
      </header>

      {/* Alerta de Error de Seguridad */}
      {pickerError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs font-medium flex-1">{pickerError.msg}</p>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Abrir fuera
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 overflow-hidden">
        
        {/* Controles Laterales */}
        <aside className="lg:col-span-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
          
          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-xs font-bold flex items-center gap-2 text-slate-500 uppercase tracking-widest">
              <RefreshCw className="w-3 h-3" /> Lote
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Prefijo</label>
                <input 
                  type="text" 
                  value={globalConfig.prefix}
                  onChange={e => setGlobalConfig(prev => ({...prev, prefix: e.target.value}))}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="IMG_"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Sufijo</label>
                <input 
                  type="text" 
                  value={globalConfig.suffix}
                  onChange={e => setGlobalConfig(prev => ({...prev, suffix: e.target.value}))}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="_V1"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Ext</label>
                <input 
                  type="text" 
                  value={globalConfig.extension}
                  onChange={e => setGlobalConfig(prev => ({...prev, extension: e.target.value.replace('.', '')}))}
                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="png"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer border-t pt-2">
              <input 
                type="checkbox" 
                checked={globalConfig.overwrite}
                onChange={e => setGlobalConfig(prev => ({...prev, overwrite: e.target.checked}))}
                className="w-3 h-3 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-[11px] font-medium text-slate-600">Sobrescribir</span>
            </label>
          </section>

          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-xs font-bold flex items-center gap-2 text-slate-500 uppercase tracking-widest">
              <ArrowUpDown className="w-3 h-3" /> Ordenación
            </h2>
            <select 
              value={filters.sort}
              onChange={e => setFilters(prev => ({...prev, sort: e.target.value as SortType}))}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-700"
            >
              <option value="name_asc">Alfabético (A-Z)</option>
              <option value="name_desc">Alfabético (Z-A)</option>
              <option value="date_desc">Fecha/Hora (Reciente)</option>
              <option value="date_asc">Fecha/Hora (Antiguo)</option>
              <option value="size_desc">Tamaño (Mayor)</option>
              <option value="size_asc">Tamaño (Menor)</option>
            </select>
            <p className="text-[9px] text-slate-400 leading-tight">Incluye precisión de minutos y segundos del sistema.</p>
          </section>

          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-xs font-bold flex items-center gap-2 text-slate-500 uppercase tracking-widest">
              <FileText className="w-3 h-3" /> Lista
            </h2>
            <textarea 
              value={pastedNames}
              onChange={e => setPastedNames(e.target.value)}
              className="w-full h-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono"
              placeholder="Nombre 1&#10;Nombre 2..."
            />
            <button 
              onClick={applyPastedNames}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all border border-slate-200"
            >
              ASIGNAR NOMBRES
            </button>
          </section>

          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-xs font-bold flex items-center gap-2 text-slate-500 uppercase tracking-widest">
              <Filter className="w-3 h-3" /> Filtros
            </h2>
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Buscar..."
                value={filters.search}
                onChange={e => setFilters(prev => ({...prev, search: e.target.value}))}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-400">DESDE</label>
                  <input 
                    type="date" 
                    value={filters.dateStart}
                    onChange={e => setFilters(prev => ({...prev, dateStart: e.target.value}))}
                    className="w-full px-1 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400">HASTA</label>
                  <input 
                    type="date" 
                    value={filters.dateEnd}
                    onChange={e => setFilters(prev => ({...prev, dateEnd: e.target.value}))}
                    className="w-full px-1 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

        </aside>

        {/* Tabla Estilo Excel (Hoja de Datos) */}
        <main className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-500">
                DATOS: <span className="text-indigo-600 font-mono">{filteredFiles.length}</span> / {files.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                OK: {files.filter(f => f.status === 'success').length}
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded border border-rose-200">
                ERROR: {files.filter(f => f.status === 'error').length}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar bg-slate-200">
            <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
              <thead className="sticky top-0 bg-slate-100 shadow-sm z-10">
                <tr className="border-b border-slate-300">
                  <th className="w-10 border-r border-slate-200 px-2 py-2 text-[10px] font-black text-slate-400 text-center">#</th>
                  <th className="w-1/4 border-r border-slate-200 px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Nombre Original</th>
                  <th className="w-16 border-r border-slate-200 px-1 py-2 text-[10px] font-black text-slate-500 text-center">Prefijo</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Nombre de Archivo</th>
                  <th className="w-16 border-r border-slate-200 px-1 py-2 text-[10px] font-black text-slate-500 text-center">Sufijo</th>
                  <th className="w-16 border-r border-slate-200 px-1 py-2 text-[10px] font-black text-slate-500 text-center">Ext</th>
                  <th className="w-1/4 px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Previsualización</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredFiles.map((f, idx) => (
                  <tr key={f.id} className={`hover:bg-indigo-50/30 transition-colors border-b border-slate-200 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                    <td className="border-r border-slate-200 px-2 py-1 text-[9px] font-mono text-slate-400 text-center">{idx + 1}</td>
                    <td className="border-r border-slate-200 px-3 py-1">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className="text-[11px] text-slate-600 truncate flex-1" title={f.originalName}>{f.originalName}</span>
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {f.status === 'processing' && <RefreshCw className="w-2.5 h-2.5 text-indigo-500 animate-spin" />}
                          {f.status === 'success' && <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />}
                          {f.status === 'error' && <XCircle className="w-2.5 h-2.5 text-rose-500" />}
                        </div>
                      </div>
                    </td>
                    <td className="border-r border-slate-200 px-0 py-0">
                      <input 
                        type="text" 
                        value={f.prefix}
                        placeholder={globalConfig.prefix || ''}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, prefix: e.target.value} : i))}
                        className="w-full h-full px-2 py-1 text-[10px] bg-transparent focus:bg-white focus:ring-1 focus:ring-inset focus:ring-indigo-500 outline-none text-center"
                      />
                    </td>
                    <td className="border-r border-slate-200 px-0 py-0">
                      <input 
                        type="text" 
                        value={f.customBaseName}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, customBaseName: e.target.value} : i))}
                        className="w-full h-full px-2 py-1 text-[11px] bg-transparent font-medium text-slate-800 focus:bg-white focus:ring-1 focus:ring-inset focus:ring-indigo-500 outline-none"
                      />
                    </td>
                    <td className="border-r border-slate-200 px-0 py-0">
                      <input 
                        type="text" 
                        value={f.suffix}
                        placeholder={globalConfig.suffix || ''}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, suffix: e.target.value} : i))}
                        className="w-full h-full px-2 py-1 text-[10px] bg-transparent focus:bg-white focus:ring-1 focus:ring-inset focus:ring-indigo-500 outline-none text-center"
                      />
                    </td>
                    <td className="border-r border-slate-200 px-0 py-0">
                      <input 
                        type="text" 
                        value={f.extension}
                        placeholder={globalConfig.extension || getExtension(f.originalName)}
                        onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, extension: e.target.value} : i))}
                        className="w-full h-full px-2 py-1 text-[10px] bg-transparent focus:bg-white focus:ring-1 focus:ring-inset focus:ring-indigo-500 outline-none text-center"
                      />
                    </td>
                    <td className="px-3 py-1 bg-slate-50/30">
                      <span className="text-[10px] font-mono font-bold text-indigo-600 truncate block" title={getFinalName(f)}>
                        {getFinalName(f)}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredFiles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                       <div className="flex flex-col items-center gap-2 text-slate-300">
                          <Trash2 className="w-10 h-10" />
                          <p className="text-xs font-bold uppercase">Sin archivos para mostrar</p>
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
      <footer className="text-center py-2 text-[10px] text-slate-400 border-t border-slate-200 flex justify-between items-center">
        <p>Copyright © 2024 <span className="font-bold text-slate-500">Gabriel Santos Grillo</span></p>
        <button onClick={() => setShowPrivacy(true)} className="hover:text-indigo-600 flex items-center gap-1 transition-colors font-bold uppercase">
          <ShieldCheck className="w-3 h-3" /> Privacidad
        </button>
      </footer>

      {/* Modales Compactos */}
      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Confirmar Ejecución
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">Se procesarán <b>{filteredFiles.length}</b> archivos hacia la carpeta destino. ¿Deseas continuar?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition-all">Cancelar</button>
              <button onClick={executeBatch} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-200">Iniciar</button>
            </div>
          </div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-md font-black text-slate-800 uppercase tracking-tighter">Política de Privacidad</h3>
              <button onClick={() => setShowPrivacy(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-[11px] text-slate-600 leading-relaxed">
              <p><b>GA-Archivos</b> opera bajo principios de privacidad absoluta por diseño:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Ejecución 100% Local:</b> El procesamiento ocurre en el motor V8 de tu navegador. Nada se envía a servidores.</li>
                <li><b>Sin Telemetría:</b> No rastreamos clics, ni nombres de archivos, ni ubicaciones.</li>
                <li><b>Seguridad del Navegador:</b> Utilizamos la File System Access API de estándar abierto.</li>
              </ul>
            </div>
            <button onClick={() => setShowPrivacy(false)} className="w-full py-2 bg-slate-100 rounded-lg font-bold text-xs">CERRAR</button>
          </div>
        </div>
      )}

      {/* Barra de Progreso Discreta */}
      {isProcessing && (
        <div className="fixed bottom-6 right-6 bg-white p-4 rounded-xl shadow-2xl border border-slate-200 z-40 w-64 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3 h-3 text-indigo-500 animate-spin" /> Procesando
            </h4>
            <span className="text-[10px] font-mono font-bold text-indigo-600">
              {files.filter(f => f.status !== 'pending' && f.status !== 'processing').length}/{filteredFiles.length}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
            <div 
              className="bg-indigo-500 h-full transition-all duration-300" 
              style={{ width: `${(files.filter(f => f.status !== 'pending' && f.status !== 'processing').length / filteredFiles.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        /* Eliminar flechas de inputs de fecha */
        input[type="date"]::-webkit-inner-spin-button,
        input[type="date"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          filter: opacity(0.5);
        }
      `}</style>
    </div>
  );
};

export default App;
