
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
  ArrowUpDown,
  Search,
  Hash,
  Calendar,
  Replace,
  Monitor,
  Smartphone,
  AlertCircle
} from 'lucide-react';
import { FileItem, GlobalConfig, FilterState, SortType } from './types';
import { formatBytes, getExtension, getBaseName } from './utils/fileUtils';

const App: React.FC = () => {
  const hoy = new Date().toLocaleDateString('en-CA'); 

  const [sourceHandle, setSourceHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [destHandle, setDestHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
    prefix: '',
    suffix: '',
    extension: '',
    overwrite: false,
    find: '',
    replace: ''
  });
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    dateStart: hoy, 
    dateEnd: hoy,   
    minSize: 0,
    sort: 'name_asc',
    limit: ''
  });
  const [pastedNames, setPastedNames] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCompatibility, setShowCompatibility] = useState(false);
  const [pickerError, setPickerError] = useState<{title: string, msg: string} | null>(null);

  const selectSource = async () => {
    setPickerError(null);
    try {
      if (!('showDirectoryPicker' in window)) throw new Error("Incompatible");
      const handle = await (window as any).showDirectoryPicker();
      setSourceHandle(handle);
      await scanFiles(handle);
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.message.includes('Cross origin')) {
        setPickerError({ title: "Seguridad", msg: "Abre la app en pestaña nueva para acceder a archivos." });
      } else if (!('showDirectoryPicker' in window)) {
        setShowCompatibility(true);
      }
    }
  };

  const selectDestination = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDestHandle(handle);
    } catch (e) {
      if (!('showDirectoryPicker' in window)) setShowCompatibility(true);
    }
  };

  const scanFiles = async (handle: FileSystemDirectoryHandle) => {
    const newFiles: FileItem[] = [];
    try {
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'file') {
          const file = await (entry as FileSystemFileHandle).getFile();
          newFiles.push({
            id: crypto.randomUUID(),
            handle: entry as FileSystemFileHandle,
            originalName: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type,
            customBaseName: getBaseName(file.name),
            prefix: '', suffix: '', extension: getExtension(file.name),
            status: 'pending'
          });
        }
      }
      setFiles(newFiles);
    } catch (e) {}
  };

  const filteredFiles = useMemo(() => {
    let result = files.filter(f => {
      const matchesSearch = f.originalName.toLowerCase().includes(filters.search.toLowerCase());
      const fileDate = new Date(f.lastModified);
      const start = filters.dateStart ? new Date(filters.dateStart + 'T00:00:00') : null;
      const end = filters.dateEnd ? new Date(filters.dateEnd + 'T23:59:59') : null;
      const matchesDate = (!start || fileDate >= start) && (!end || fileDate <= end);
      return matchesSearch && matchesDate;
    });

    result.sort((a, b) => {
      switch (filters.sort) {
        case 'name_asc': return a.originalName.localeCompare(b.originalName);
        case 'name_desc': return b.originalName.localeCompare(a.originalName);
        case 'date_asc': return a.lastModified - b.lastModified;
        case 'date_desc': return b.lastModified - a.lastModified;
        case 'size_asc': return a.size - b.size;
        case 'size_desc': return b.size - a.size;
        default: return 0;
      }
    });

    if (typeof filters.limit === 'number' && filters.limit > 0) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }, [files, filters]);

  const applyPastedNames = () => {
    const names = pastedNames.split('\n').filter(n => n.trim() !== '');
    setFiles(prev => prev.map((f) => {
      const idxInView = filteredFiles.findIndex(ff => ff.id === f.id);
      if (idxInView !== -1 && names[idxInView]) return { ...f, customBaseName: names[idxInView].trim() };
      return f;
    }));
  };

  const getFinalName = (f: FileItem) => {
    const prefix = f.prefix || globalConfig.prefix;
    const suffix = f.suffix || globalConfig.suffix;
    const ext = f.extension || globalConfig.extension || getExtension(f.originalName);
    
    let base = f.customBaseName;
    if (globalConfig.find !== '') {
      base = base.split(globalConfig.find).join(globalConfig.replace);
    }
    
    const dot = (ext && !ext.startsWith('.')) ? '.' : '';
    return `${prefix}${base}${suffix}${dot}${ext}`;
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
        const newFileHandle = await destHandle.getFileHandle(finalName, { create: true });
        const writable = await (newFileHandle as any).createWritable();
        await writable.write(sourceFile);
        await writable.close();
        updatedFiles[idx] = { ...updatedFiles[idx], status: 'success' };
      } catch (err: any) {
        updatedFiles[idx] = { ...updatedFiles[idx], status: 'error', errorMessage: err.message };
      }
      setFiles([...updatedFiles]);
    }
    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-full mx-auto p-4 lg:p-4 space-y-3 font-sans bg-slate-50">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-5 py-2 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg text-white"><FolderOpen className="w-5 h-5" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">GA-Archivos</h1>
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Gestor Nombres Archivos</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={selectSource} className="flex items-center gap-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors">
            <FolderOpen className="w-3 h-3" /> Origen: {sourceHandle?.name || '---'}
          </button>
          <button onClick={selectDestination} className="flex items-center gap-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors">
            <FolderOpen className="w-3 h-3" /> Destino: {destHandle?.name || '---'}
          </button>
          <button disabled={filteredFiles.length === 0 || !destHandle || isProcessing} onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-4 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-bold text-xs shadow-md transition-all">
            <Play className="w-3 h-3" /> EJECUTAR
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 overflow-hidden">
        <aside className="lg:col-span-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-[10px] font-black flex items-center gap-2 text-slate-400 uppercase tracking-widest border-b pb-2"><RefreshCw className="w-3 h-3" /> Configuración Global</h2>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Prefijo</label>
                  <input type="text" value={globalConfig.prefix} onChange={e => setGlobalConfig(prev => ({...prev, prefix: e.target.value}))} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500" placeholder="IMG_" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Sufijo</label>
                  <input type="text" value={globalConfig.suffix} onChange={e => setGlobalConfig(prev => ({...prev, suffix: e.target.value}))} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500" placeholder="_V1" />
                </div>
              </div>
              
              <div className="pt-2 space-y-2 border-t border-slate-100">
                 <div className="flex items-center gap-1 text-[9px] font-black text-indigo-400 uppercase tracking-widest"><Replace className="w-2.5 h-2.5" /> Sustituir</div>
                 <div className="grid grid-cols-1 gap-1.5">
                    <input 
                      type="text" 
                      value={globalConfig.find} 
                      onChange={e => setGlobalConfig(prev => ({...prev, find: e.target.value}))} 
                      className="w-full px-2 py-1 bg-indigo-50/50 border border-indigo-100 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500 font-medium" 
                      placeholder="Buscar..." 
                    />
                    <input 
                      type="text" 
                      value={globalConfig.replace} 
                      onChange={e => setGlobalConfig(prev => ({...prev, replace: e.target.value}))} 
                      className="w-full px-2 py-1 bg-emerald-50/50 border border-emerald-100 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-500 font-medium" 
                      placeholder="Reemplazar por..." 
                    />
                 </div>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1"><input type="checkbox" checked={globalConfig.overwrite} onChange={e => setGlobalConfig(prev => ({...prev, overwrite: e.target.checked}))} className="w-3 h-3 rounded border-slate-300 text-indigo-600" /><span className="text-[11px] font-medium text-slate-600">Sobrescribir</span></label>
          </section>

          <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-[10px] font-black flex items-center gap-2 text-slate-400 uppercase tracking-widest border-b pb-2"><FileText className="w-3 h-3" /> Mapeo Externo</h2>
            <textarea value={pastedNames} onChange={e => setPastedNames(e.target.value)} className="w-full h-60 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono" placeholder="Pega aquí los nombres..." />
            <button onClick={applyPastedNames} className="w-full py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-bold hover:bg-slate-900 transition-colors uppercase">Asignar a Lista Visible</button>
          </section>
        </aside>

        <main className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 border-b border-slate-300 bg-slate-100 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 border-r border-slate-300 pr-3 h-6">
              <span className="text-[9px] font-black text-slate-400 uppercase">Ficheros:</span>
              <span className="text-[11px] font-mono font-bold text-indigo-700 leading-none">{filteredFiles.length}</span>
              <span className="text-[10px] text-slate-300 font-bold">/</span>
              <span className="text-[11px] font-mono font-medium text-slate-400 leading-none">{files.length}</span>
            </div>

            <div className="flex items-center gap-2 border-r border-slate-300 pr-3 h-6">
              <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Hash className="w-3 h-3" /> Límite:</label>
              <input 
                type="number" 
                value={filters.limit}
                onChange={e => setFilters(prev => ({...prev, limit: e.target.value === '' ? '' : parseInt(e.target.value)}))}
                className="w-12 px-1 py-0.5 text-[11px] font-bold bg-white border border-slate-300 rounded outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                placeholder="Nº"
              />
            </div>

            <div className="flex items-center gap-2 border-r border-slate-300 pr-3 h-6">
              <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Orden:</label>
              <select 
                value={filters.sort}
                onChange={e => setFilters(prev => ({...prev, sort: e.target.value as SortType}))}
                className="bg-white border border-slate-300 rounded text-[10px] font-bold text-slate-700 px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="name_asc">A-Z</option>
                <option value="name_desc">Z-A</option>
                <option value="date_desc">Reciente</option>
                <option value="date_asc">Antiguo</option>
                <option value="size_desc">Tamaño (+)</option>
                <option value="size_asc">Tamaño (-)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 border-r border-slate-300 pr-3 h-6">
              <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha:</label>
              <div className="flex items-center bg-white border border-slate-300 rounded overflow-hidden">
                <input 
                  type="date" 
                  value={filters.dateStart} 
                  onChange={e => setFilters(prev => ({...prev, dateStart: e.target.value}))} 
                  className="px-1 py-0.5 text-[10px] font-bold text-slate-600 outline-none w-24" 
                />
                <span className="text-[10px] text-slate-300 font-bold px-1">/</span>
                <input 
                  type="date" 
                  value={filters.dateEnd} 
                  onChange={e => setFilters(prev => ({...prev, dateEnd: e.target.value}))} 
                  className="px-1 py-0.5 text-[10px] font-bold text-slate-600 outline-none w-24" 
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[120px]">
              <div className="relative w-full">
                <Search className="w-3 h-3 absolute left-2 top-1.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="FILTRAR..."
                  value={filters.search}
                  onChange={e => setFilters(prev => ({...prev, search: e.target.value}))}
                  className="w-full pl-7 pr-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500 uppercase tracking-tight"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-slate-300 pl-3 h-6">
              <div className="flex items-center gap-1 text-[8px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 uppercase">OK: {files.filter(f => f.status === 'success').length}</div>
              <div className="flex items-center gap-1 text-[8px] font-black bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 uppercase">ERR: {files.filter(f => f.status === 'error').length}</div>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar bg-slate-200">
            <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
              <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                <tr className="border-b border-slate-300">
                  <th className="w-10 border-r border-slate-200 px-1 py-1 text-[9px] font-black text-slate-400 text-center">#</th>
                  <th className="w-1/4 border-r border-slate-200 px-3 py-1 text-[9px] font-black text-slate-500 uppercase">Original</th>
                  <th className="w-16 border-r border-slate-200 px-1 py-1 text-[9px] font-black text-slate-500 text-center">P</th>
                  <th className="border-r border-slate-200 px-3 py-1 text-[9px] font-black text-slate-500 uppercase">Base Nuevo</th>
                  <th className="w-16 border-r border-slate-200 px-1 py-1 text-[9px] font-black text-slate-500 text-center">S</th>
                  <th className="w-14 border-r border-slate-200 px-1 py-1 text-[9px] font-black text-slate-500 text-center">Ext</th>
                  <th className="w-1/4 px-3 py-1 text-[9px] font-black text-slate-500 uppercase">Destino</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredFiles.map((f, idx) => (
                  <tr key={f.id} className={`hover:bg-indigo-50/40 border-b border-slate-100 ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="border-r border-slate-200 px-1 py-0.5 text-[8px] font-mono text-slate-400 text-center">{idx + 1}</td>
                    <td className="border-r border-slate-200 px-3 py-0.5 overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-slate-600 truncate flex-1 font-medium">{f.originalName}</span>
                        {f.status !== 'pending' && (
                          <div className="flex-shrink-0">
                            {f.status === 'success' && <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />}
                            {f.status === 'error' && <XCircle className="w-2.5 h-2.5 text-rose-500" />}
                            {f.status === 'processing' && <RefreshCw className="w-2.5 h-2.5 text-indigo-500 animate-spin" />}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-r border-slate-200 p-0">
                      <input type="text" value={f.prefix} placeholder={globalConfig.prefix} onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, prefix: e.target.value} : i))} className="w-full text-center text-[9px] bg-transparent focus:bg-white outline-none py-1 px-1 h-6" />
                    </td>
                    <td className="border-r border-slate-200 p-0">
                      <input type="text" value={f.customBaseName} onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, customBaseName: e.target.value} : i))} className="w-full text-[10px] font-bold text-slate-800 bg-transparent focus:bg-white outline-none py-1 px-2 h-6" />
                    </td>
                    <td className="border-r border-slate-200 p-0">
                      <input type="text" value={f.suffix} placeholder={globalConfig.suffix} onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, suffix: e.target.value} : i))} className="w-full text-center text-[9px] bg-transparent focus:bg-white outline-none py-1 px-1 h-6" />
                    </td>
                    <td className="border-r border-slate-200 p-0">
                      <input type="text" value={f.extension} placeholder={globalConfig.extension} onChange={e => setFiles(prev => prev.map(i => i.id === f.id ? {...i, extension: e.target.value} : i))} className="w-full text-center text-[9px] bg-transparent focus:bg-white outline-none py-1 px-1 h-6" />
                    </td>
                    <td className="px-3 py-0.5 bg-slate-50/50">
                      <span className="text-[9px] font-mono font-black text-indigo-600 truncate block" title={getFinalName(f)}>{getFinalName(f)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <footer className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-200 flex flex-wrap justify-between items-center bg-white rounded-lg shadow-sm gap-4">
        <p>Creado por <span className="font-black text-slate-500 uppercase tracking-tighter">Gabriel Santos Grillo - 2026</span></p>
        <div className="flex gap-4">
          <button onClick={() => setShowCompatibility(true)} className="hover:text-amber-600 font-black uppercase tracking-widest flex items-center gap-1 transition-colors"><Monitor className="w-3 h-3" /> Compatibilidad</button>
          <button onClick={() => setShowPrivacy(true)} className="hover:text-indigo-600 font-black uppercase tracking-widest flex items-center gap-1 transition-colors"><ShieldCheck className="w-3 h-3" /> Privacidad</button>
        </div>
      </footer>

      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Confirmar Proceso</h3>
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 font-medium">
              Se procesarán <b className="text-indigo-600">{filteredFiles.length}</b> ficheros seleccionados hacia el destino.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition-all">Cancelar</button>
              <button onClick={executeBatch} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-200 transition-all">Iniciar Ahora</button>
            </div>
          </div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8 space-y-4 border border-slate-200">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b pb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-600" /> Privacidad de Datos Local</h3>
            <p className="text-[11px] text-slate-600 leading-relaxed italic">Esta herramienta procesa los archivos íntegramente en tu navegador. Los nombres, rutas y contenidos nunca abandonan tu ordenador ni se envían a ningún servidor externo. Gabriel Santos Grillo no tiene acceso a tus datos.</p>
            <button onClick={() => setShowPrivacy(false)} className="w-full py-2 bg-slate-100 rounded-lg font-bold text-xs hover:bg-slate-200 transition-colors">CERRAR</button>
          </div>
        </div>
      )}

      {showCompatibility && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8 space-y-6 border border-slate-200">
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b pb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Compatibilidad y Restricciones</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Esta aplicación utiliza la tecnología <strong>File System Access API</strong> para permitir el acceso directo a carpetas de tu ordenador. Por motivos de seguridad y arquitectura, existen limitaciones importantes de compatibilidad:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs"><Monitor className="w-4 h-4" /> Sistemas Soportados</div>
                <ul className="text-[10px] text-emerald-700 space-y-1 font-medium">
                  <li>• Windows (Chrome, Edge, Opera)</li>
                  <li>• macOS (Chrome, Edge, Opera)</li>
                  <li>• Linux (Chrome, Edge)</li>
                  <li>• ChromeOS (Nativo)</li>
                </ul>
              </div>

              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs"><Smartphone className="w-4 h-4" /> No Soportados</div>
                <ul className="text-[10px] text-rose-700 space-y-1 font-medium">
                  <li>• Android (Todos los navegadores)</li>
                  <li>• iPhone / iPad (iOS / iPadOS)</li>
                  <li>• Navegador Safari (Mac/iOS)</li>
                  <li>• Firefox (Soporte limitado de API)</li>
                </ul>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-[10px] text-slate-500 italic leading-snug">
                <strong>Nota Técnica:</strong> Los sistemas operativos móviles utilizan "sandboxing" estricto que impide que las aplicaciones web seleccionen directorios completos para lectura y escritura masiva. Para un funcionamiento óptimo, utiliza un ordenador de escritorio.
              </p>
            </div>

            <button onClick={() => setShowCompatibility(false)} className="w-full py-2 bg-slate-800 text-white rounded-lg font-bold text-xs hover:bg-slate-900 transition-colors uppercase tracking-widest">Entendido</button>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed bottom-14 right-8 bg-white p-4 rounded-xl shadow-2xl border border-slate-200 z-40 w-64">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2"><Clock className="w-3 h-3 text-indigo-500 animate-spin" /> Procesando Lote</h4>
            <span className="text-[10px] font-mono font-bold text-indigo-600">{files.filter(f => f.status === 'success' || f.status === 'error').length}/{filteredFiles.length}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden"><div className="bg-indigo-500 h-full transition-all" style={{ width: `${(files.filter(f => f.status === 'success' || f.status === 'error').length / filteredFiles.length) * 100}%` }} /></div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 1; }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          padding: 0;
          margin: 0;
          cursor: pointer;
          filter: opacity(0.5);
        }
      `}</style>
    </div>
  );
};

export default App;
