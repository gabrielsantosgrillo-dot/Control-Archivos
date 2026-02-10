
export interface FileItem {
  id: string;
  handle: FileSystemFileHandle;
  originalName: string;
  size: number;
  lastModified: number;
  type: string;
  
  // Configuraciones de renombrado
  customBaseName: string;
  prefix: string;
  suffix: string;
  extension: string;
  
  status: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
  errorMessage?: string;
}

export interface GlobalConfig {
  prefix: string;
  suffix: string;
  extension: string;
  overwrite: boolean;
}

export interface FilterState {
  search: string;
  dateStart: string;
  dateEnd: string;
  minSize: number; // en KB
}
