
export type SortType = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'size_asc' | 'size_desc';

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
  find: string;
  replace: string;
}

export interface FilterState {
  search: string;
  dateStart: string;
  dateEnd: string;
  minSize: number; // en KB
  sort: SortType;
  limit: number | ''; // Campo para limitar ficheros a tratar
}
