import type { FileFingerprint } from "./json";

export interface CodebaseIndex {
  version: number;
  generatedAt?: string;
  entrypoints?: Array<{ path: string; kind?: string; summary?: string }>;
  modules?: Array<{ path: string; kind?: string; summary?: string; tests?: string[] }>;
  commands?: Array<{ name: string; summary?: string }>;
  verification?: Array<{ command: string; purpose?: string }>;
  risks?: Array<{ area: string; summary?: string }>;
  fingerprints?: Record<string, FileFingerprint>;
}

export interface BuildCodebaseIndexOptions {
  cwd: string;
  now: Date;
  existing?: CodebaseIndex;
}

export interface BuildCodebaseIndexResult {
  index: CodebaseIndex;
  changed: boolean;
  staleFiles: string[];
  scannedFiles: number;
  indexedFiles: number;
  truncated: boolean;
}

export const MAX_FILES_SCANNED = 50000;
export const MAX_INDEXED_FILES = 5000;
export const MAX_FINGERPRINT_BYTES_PER_FILE = 1048576;

export const RESERVED_DETERMINISTIC_RISK_AREAS: Record<string, true> = {
  "scan coverage": true,
  "large file skipped": true,
  "symlink skipped": true,
};
