import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { FileFingerprint } from "./json";
import { isSafeRelativePath } from "./validators";
import { runGitNulSeparated } from "./git";

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
  limits?: Partial<{
    maxFilesScanned: number;
    maxGitLsFilesBytes: number;
    maxIndexedFiles: number;
    maxFingerprintBytesPerFile: number;
    maxRisksPerArea: number;
  }>;
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
export const MAX_GIT_LS_FILES_BYTES = 64 * 1024 * 1024;
export const MAX_INDEXED_FILES = 5000;
export const MAX_FINGERPRINT_BYTES_PER_FILE = 1048576;
export const MAX_RISKS_PER_AREA = 64;

export const RESERVED_DETERMINISTIC_RISK_AREAS: Record<string, true> = {
  "scan coverage": true,
  "large file skipped": true,
  "symlink skipped": true,
  "unsafe path skipped": true,
};

const DEFAULT_LIMITS = {
  maxFilesScanned: MAX_FILES_SCANNED,
  maxGitLsFilesBytes: MAX_GIT_LS_FILES_BYTES,
  maxIndexedFiles: MAX_INDEXED_FILES,
  maxFingerprintBytesPerFile: MAX_FINGERPRINT_BYTES_PER_FILE,
  maxRisksPerArea: MAX_RISKS_PER_AREA,
} as const;

const EXCLUDE_PREFIXES = [
  ".specwright/cache/",
  ".specwright/tmp/",
];
const EXCLUDE_DIR_NAMES = [
  ".git",
  "node_modules",
  ".omp",
  "dist",
  "build",
  ".next",
  "coverage",
  "target",
];

const SOURCE_EXTENSIONS: Record<string, true> = {
  ".ts": true,
  ".tsx": true,
  ".js": true,
  ".jsx": true,
  ".mjs": true,
  ".cjs": true,
  ".py": true,
  ".go": true,
  ".rs": true,
  ".java": true,
  ".kt": true,
  ".swift": true,
  ".rb": true,
  ".php": true,
};

function hasSourceExtension(relPath: string): boolean {
  return SOURCE_EXTENSIONS[extname(relPath).toLowerCase()] === true;
}

const ENTRYPOINT_BASE_NAMES: Record<string, true> = {
  cli: true,
  main: true,
  index: true,
  server: true,
  app: true,
};
type ModuleRecord = NonNullable<CodebaseIndex["modules"]>[number];
interface ModuleLookup {
  byPath: ReadonlyMap<string, ModuleRecord>;
  byBaseLower: ReadonlyMap<string, readonly ModuleRecord[]>;
}

function isFileFingerprint(value: unknown): value is FileFingerprint {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isFinite((value as Record<string, unknown>).mtime) &&
    Number.isFinite((value as Record<string, unknown>).size) &&
    typeof (value as Record<string, unknown>).checksum === "string"
  );
}

type CodebaseRisk = NonNullable<CodebaseIndex["risks"]>[number];
type RiskRecorder = (risk: CodebaseRisk) => void;
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}


async function streamFileFingerprint(
  absolutePath: string,
  maxBytes: number,
): Promise<FileFingerprint | undefined> {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile() || stats.size > maxBytes) {
      return undefined;
    }
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
    // Codebase index fingerprints are content-stable; mtime is retained only for FileFingerprint compatibility.
    return { mtime: 0, size: stats.size, checksum: hash.digest("hex") };
  } catch {
    return undefined;
  }
}
interface DiscoveredFile {
  relPath: string;
  absolute: string;
  size: number;
}
type DiscoveryTruncationReason = "file-cap" | "git-output-byte-cap";

interface DiscoveryResult {
  files: DiscoveredFile[];
  scannedFiles: number;
  truncationReason?: DiscoveryTruncationReason;
}


function normalizePath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}
function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareRisk(a: { area: string; summary?: string }, b: { area: string; summary?: string }): number {
  return compareCodeUnit(`${a.area}:${a.summary ?? ""}`, `${b.area}:${b.summary ?? ""}`);
}



function shouldExclude(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  for (const prefix of EXCLUDE_PREFIXES) {
    const dirName = prefix.slice(0, -1);
    if (normalized === dirName || normalized.startsWith(prefix)) {
      return true;
    }
  }
  const segments = normalized.split("/");
  for (const name of EXCLUDE_DIR_NAMES) {
    if (segments.includes(name)) {
      return true;
    }
  }
  return false;
}

function isTestFile(relPath: string): boolean {
  const base = basename(relPath);
  if (/[.-](?:test|spec)\.[^.]+$/i.test(base)) {
    return true;
  }
  const normalized = normalizePath(relPath);
  return /^(?:__tests?__|tests?)(?:\/|$)/i.test(normalized) || /\/(?:__tests?__|tests?)(?:\/|$)/i.test(normalized);
}

function inferKind(relPath: string): string {
  const normalized = normalizePath(relPath);
  if (normalized === "package.json") {
    return "package";
  }
  const base = basename(normalized, extname(normalized));
  const lowerBase = base.toLowerCase();
  if (normalized.startsWith("bin/")) {
    return "bin";
  }
  if (lowerBase === "cli") {
    return "cli";
  }
  if (["main", "index", "server", "app"].includes(lowerBase)) {
    return "main";
  }
  const dir = dirname(normalized);
  if (dir === "core" || dir.endsWith("/core")) {
    return "core";
  }
  if (normalized.startsWith("src/")) {
    return "module";
  }
  if (normalized.startsWith("lib/")) {
    return "library";
  }
  if (isTestFile(normalized)) {
    return "test";
  }
  return "module";
}

async function tryGitDiscoverFiles(
  cwd: string,
  maxFilesScanned: number,
  maxGitLsFilesBytes: number,
  recordRisk: RiskRecorder,
): Promise<DiscoveryResult | undefined> {
  const files: DiscoveredFile[] = [];
  let hitFileCap = false;

  const result = await runGitNulSeparated(
    cwd,
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    async (rawPath) => {
      const relPath = normalizePath(rawPath);
      if (shouldExclude(relPath)) {
        return true;
      }
      if (!isSafeRelativePath(relPath)) {
        recordRisk({ area: "unsafe path skipped", summary: `Skipped unsafe path: ${relPath}` });
        return true;
      }
      const absolute = resolve(cwd, relPath);
      try {
        const st = await lstat(absolute);
        if (st.isSymbolicLink()) {
          recordRisk({ area: "symlink skipped", summary: `Skipped symlinked path: ${relPath}` });
          return true;
        }
        if (st.isFile()) {
          if (files.length >= maxFilesScanned) {
            hitFileCap = true;
            return false;
          }
          files.push({ relPath, absolute, size: st.size });
        }
      } catch {
        // Ignore paths that disappeared or are inaccessible.
      }
      return true;
    },
    { env: { GIT_TERMINAL_PROMPT: "0" }, maxStdoutBytes: maxGitLsFilesBytes },
  );

  if (hitFileCap) {
    files.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));
    return { files, scannedFiles: files.length, truncationReason: "file-cap" };
  }
  if (result.truncated) {
    files.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));
    return { files, scannedFiles: files.length, truncationReason: "git-output-byte-cap" };
  }
  if (result.exitCode !== 0) {
    return undefined;
  }

  files.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));
  return { files, scannedFiles: files.length };
}
async function discoverFiles(
  cwd: string,
  maxFilesScanned: number,
  maxGitLsFilesBytes: number,
  recordRisk: RiskRecorder,
): Promise<DiscoveryResult> {
  const gitDiscovery = await tryGitDiscoverFiles(cwd, maxFilesScanned, maxGitLsFilesBytes, recordRisk);
  if (gitDiscovery !== undefined) {
    return gitDiscovery;
  }

  const candidates: DiscoveredFile[] = [];
  const pending: PendingFsEntry[] = [];
  const symlinkPaths = new Set<string>();
  const unsafePaths = new Set<string>();
  let hitFileCap = false;

  interface PendingFsEntry {
    relPath: string;
    absolute: string;
    kind: "directory" | "file";
    sortKey: string;
  }

  function insertPending(queue: PendingFsEntry[], entry: PendingFsEntry): void {
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const current = queue[mid];
      if (current === undefined || compareCodeUnit(entry.sortKey, current.sortKey) < 0) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    queue.splice(low, 0, entry);
  }

  async function enqueueDirectory(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const relPath = normalizePath(relative(cwd, absolute));
      if (shouldExclude(relPath)) {
        continue;
      }
      const kind = entry.isDirectory() ? "directory" : "file";
      const sortKey = kind === "directory" ? `${relPath}/` : relPath;
      if (!isSafeRelativePath(relPath)) {
        unsafePaths.add(relPath);
        insertPending(pending, { relPath, absolute, kind, sortKey });
        continue;
      }
      if (entry.isSymbolicLink()) {
        symlinkPaths.add(relPath);
        insertPending(pending, { relPath, absolute, kind: "file", sortKey: relPath });
        continue;
      }
      if (entry.isDirectory() || entry.isFile()) {
        insertPending(pending, { relPath, absolute, kind, sortKey });
      }
    }
  }

  await enqueueDirectory(cwd);
  while (pending.length > 0) {
    const entry = pending.shift();
    if (!entry) {
      break;
    }
    if (unsafePaths.has(entry.relPath)) {
      recordRisk({ area: "unsafe path skipped", summary: `Skipped unsafe path: ${entry.relPath}` });
      continue;
    }
    if (symlinkPaths.has(entry.relPath)) {
      recordRisk({ area: "symlink skipped", summary: `Skipped symlinked path: ${entry.relPath}` });
      continue;
    }
    if (entry.kind === "directory") {
      await enqueueDirectory(entry.absolute);
      continue;
    }
    if (candidates.length >= maxFilesScanned) {
      hitFileCap = true;
      break;
    }
    try {
      const st = await stat(entry.absolute);
      if (st.isFile()) {
        candidates.push({ relPath: entry.relPath, absolute: entry.absolute, size: st.size });
      }
    } catch {
      // Ignore files that disappeared during the walk.
    }
  }
  candidates.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));

  const result: DiscoveryResult = { files: candidates, scannedFiles: candidates.length };
  if (hitFileCap) {
    result.truncationReason = "file-cap";
  }
  return result;
}

interface PackageInfo {
  main?: string;
  module?: string;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
}

async function readPackageInfo(cwd: string): Promise<PackageInfo | undefined> {
  try {
    const content = await readFile(join(cwd, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed as PackageInfo : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePackageEntrypointPath(value: string, filePaths: ReadonlySet<string>): string | undefined {
  const normalized = normalizePath(value).replace(/^\.\/+/, "");
  if (
    !isSafeRelativePath(normalized) ||
    shouldExclude(normalized) ||
    !filePaths.has(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function packageEntrypointCandidates(
  pkg: PackageInfo,
  filePaths: ReadonlySet<string>,
): Array<{ path: string; kind?: string; summary?: string }> {
  const entrypoints: Array<{ path: string; kind?: string; summary?: string }> = [];
  if (typeof pkg.main === "string") {
    const path = normalizePackageEntrypointPath(pkg.main, filePaths);
    if (path !== undefined) {
      entrypoints.push({ path, kind: "main" });
    }
  }
  if (typeof pkg.module === "string") {
    const path = normalizePackageEntrypointPath(pkg.module, filePaths);
    if (path !== undefined) {
      entrypoints.push({ path, kind: "module" });
    }
  }
  if (typeof pkg.bin === "string") {
    const path = normalizePackageEntrypointPath(pkg.bin, filePaths);
    if (path !== undefined) {
      entrypoints.push({ path, kind: "bin" });
    }
  } else if (isRecord(pkg.bin)) {
    for (const [name, value] of Object.entries(pkg.bin).sort(([a], [b]) => compareCodeUnit(a, b))) {
      if (typeof value === "string") {
        const path = normalizePackageEntrypointPath(value, filePaths);
        if (path !== undefined) {
          entrypoints.push({ path, kind: "bin", summary: `bin command: ${name}` });
        }
      }
    }
  }
  return entrypoints;
}

function addPackageVerification(pkg: PackageInfo, verification: Array<{ command: string; purpose?: string }>): void {
  if (!isRecord(pkg.scripts)) {
    return;
  }
  const scriptOrder = ["test", "lint", "typecheck", "build", "check", "verify"];
  for (const name of scriptOrder) {
    const command = pkg.scripts[name];
    if (typeof command === "string") {
      verification.push({ command, purpose: `Run ${name}` });
    }
  }
}

function addPackageCommands(pkg: PackageInfo, commands: Array<{ name: string; summary?: string }>): void {
  if (!isRecord(pkg.scripts)) {
    return;
  }
  for (const name of Object.keys(pkg.scripts).sort(compareCodeUnit)) {
    commands.push({ name, summary: `package script: ${name}` });
  }
}

function deriveSourceBaseName(testPath: string): string | undefined {
  const base = basename(testPath);
  const match = base.match(/^(.+?)(?:[.-](?:test|spec))(\..+)$/i);
  if (!match) {
    return undefined;
  }
  return `${match[1]}${match[2]}`;
}

function createModuleLookup(modules: readonly ModuleRecord[], modulesByPath: ReadonlyMap<string, ModuleRecord>): ModuleLookup {
  const byPath = new Map(modulesByPath);
  const byBaseLower = new Map<string, ModuleRecord[]>();
  for (const mod of modules) {
    const key = basename(mod.path).toLowerCase();
    const existing = byBaseLower.get(key);
    if (existing) {
      existing.push(mod);
    } else {
      byBaseLower.set(key, [mod]);
    }
  }
  return { byPath, byBaseLower };
}

function findAssociatedModule(testPath: string, lookup: ModuleLookup): ModuleRecord | undefined {
  const sourceBase = deriveSourceBaseName(testPath);
  if (sourceBase === undefined) {
    return undefined;
  }
  const normalizedTestPath = normalizePath(testPath);
  const testDir = dirname(normalizedTestPath);
  const exactPath = normalizePath(join(testDir, sourceBase));
  const exact = lookup.byPath.get(exactPath);
  if (exact) {
    return exact;
  }
  const testDirBase = basename(testDir).toLowerCase();
  if (["__test__", "__tests__", "test", "tests"].includes(testDirBase)) {
    const parentPath = normalizePath(join(dirname(testDir), sourceBase));
    const parent = lookup.byPath.get(parentPath);
    if (parent) {
      return parent;
    }
  }
  const matches = lookup.byBaseLower.get(sourceBase.toLowerCase());
  if (matches?.length === 1) {
    return matches[0];
  }
  return undefined;
}

interface NormalizedIndexPart {
  version: number;
  entrypoints: Array<{ path: string; kind?: string; summary?: string }>;
  modules: Array<{ path: string; kind?: string; summary?: string; tests: string[] }>;
  commands: Array<{ name: string; summary?: string }>;
  verification: Array<{ command: string; purpose?: string }>;
  risks: Array<{ area: string; summary?: string }>;
  fingerprints: Array<[string, { mtime: number; size: number; checksum: string }]>;
}

function normalizeIndexPart(index: CodebaseIndex): NormalizedIndexPart {
  const entrypoints = (index.entrypoints ?? [])
    .map((entry) => {
      const out: { path: string; kind?: string; summary?: string } = { path: entry.path };
      if (entry.kind !== undefined) {
        out.kind = entry.kind;
      }
      if (entry.summary !== undefined) {
        out.summary = entry.summary;
      }
      return out;
    })
    .sort((a, b) => compareCodeUnit(a.path, b.path));
  const modules = (index.modules ?? [])
    .map((mod) => {
      const out: { path: string; kind?: string; summary?: string; tests: string[] } = {
        path: mod.path,
        tests: [...(mod.tests ?? [])].sort(compareCodeUnit),
      };
      if (mod.kind !== undefined) {
        out.kind = mod.kind;
      }
      if (mod.summary !== undefined) {
        out.summary = mod.summary;
      }
      return out;
    })
    .sort((a, b) => compareCodeUnit(a.path, b.path));
  const commands = [...(index.commands ?? [])].sort((a, b) => compareCodeUnit(a.name, b.name));
  const verification = [...(index.verification ?? [])].sort((a, b) => compareCodeUnit(a.command, b.command));
  const risks = [...(index.risks ?? [])].sort(compareRisk);
  const fingerprints = Object.entries(index.fingerprints ?? {})
    .filter((entry): entry is [string, FileFingerprint] => isFileFingerprint(entry[1]))
    .sort(([a], [b]) => compareCodeUnit(a, b))
    .map(([path, fp]) => [path, { mtime: fp.mtime, size: fp.size, checksum: fp.checksum }] as [string, { mtime: number; size: number; checksum: string }]);
  return { version: index.version ?? 0, entrypoints, modules, commands, verification, risks, fingerprints };
}

export async function buildCodebaseIndex(options: BuildCodebaseIndexOptions): Promise<BuildCodebaseIndexResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const risks: CodebaseRisk[] = [];
  const riskKeys = new Set<string>();
  const riskCountsByArea = new Map<string, number>();
  const omittedRiskAreas = new Set<string>();
  let riskTruncated = false;
  const recordRisk: RiskRecorder = (risk) => {
    const key = `${risk.area}\u0000${risk.summary ?? ""}`;
    if (riskKeys.has(key)) {
      return;
    }
    riskKeys.add(key);
    const count = riskCountsByArea.get(risk.area) ?? 0;
    if (count < limits.maxRisksPerArea) {
      risks.push(risk);
      riskCountsByArea.set(risk.area, count + 1);
      return;
    }
    riskTruncated = true;
    if (!omittedRiskAreas.has(risk.area)) {
      omittedRiskAreas.add(risk.area);
      risks.push({
        area: risk.area,
        summary: `Additional ${risk.area} risks omitted after ${limits.maxRisksPerArea} entries.`,
      });
    }
  };

  const { files, scannedFiles, truncationReason } = await discoverFiles(
    options.cwd,
    limits.maxFilesScanned,
    limits.maxGitLsFilesBytes,
    recordRisk,
  );
  const scanTruncated = truncationReason !== undefined;
  if (truncationReason === "file-cap") {
    recordRisk({
      area: "scan coverage",
      summary: `Scanned file cap of ${limits.maxFilesScanned} exceeded; discovery stopped.`,
    });
  } else if (truncationReason === "git-output-byte-cap") {
    recordRisk({
      area: "scan coverage",
      summary: `git ls-files output exceeded ${limits.maxGitLsFilesBytes} bytes; discovery stopped before filesystem fallback.`,
    });
  }

  const filePaths = new Set(files.map((file) => file.relPath));
  const hasPackageJson = filePaths.has("package.json");
  const pkg = hasPackageJson ? await readPackageInfo(options.cwd) : undefined;

  const entrypoints: Array<{ path: string; kind?: string; summary?: string }> = [];
  const modules: Array<{ path: string; kind?: string; summary?: string; tests?: string[] }> = [];
  const commands: Array<{ name: string; summary?: string }> = [];
  const verification: Array<{ command: string; purpose?: string }> = [];
  const countedIndexedPaths = new Set<string>();
  let indexedTruncated = false;
  type EntryPointRecord = NonNullable<CodebaseIndex["entrypoints"]>[number];
  const entrypointPaths = new Set<string>();
  const modulesByPath = new Map<string, ModuleRecord>();

  let indexedCapRiskRecorded = false;
  function reserveIndexedPath(path: string): boolean {
    if (countedIndexedPaths.has(path)) {
      return true;
    }
    if (countedIndexedPaths.size >= limits.maxIndexedFiles) {
      indexedTruncated = true;
      if (!indexedCapRiskRecorded) {
        indexedCapRiskRecorded = true;
        recordRisk({
          area: "scan coverage",
          summary: `Indexed file cap of ${limits.maxIndexedFiles} exceeded; candidate list truncated.`,
        });
      }
      return false;
    }
    countedIndexedPaths.add(path);
    return true;
  }

  function addEntrypoint(entry: EntryPointRecord): void {
    if (entrypointPaths.has(entry.path)) {
      return;
    }
    if (!reserveIndexedPath(entry.path)) {
      return;
    }
    entrypoints.push(entry);
    entrypointPaths.add(entry.path);
  }
  if (hasPackageJson) {
    addEntrypoint({ path: "package.json", kind: "package" });
  }

  function addModule(mod: ModuleRecord): ModuleRecord | undefined {
    const existing = modulesByPath.get(mod.path);
    if (existing) {
      return existing;
    }
    if (!reserveIndexedPath(mod.path)) {
      return undefined;
    }
    modules.push(mod);
    modulesByPath.set(mod.path, mod);
    return mod;
  }

  if (pkg) {
    for (const entry of packageEntrypointCandidates(pkg, filePaths)) {
      addEntrypoint(entry);
    }
    addPackageVerification(pkg, verification);
    addPackageCommands(pkg, commands);
  }

  const testPaths: string[] = [];

  for (const file of files) {
    if (file.relPath === "package.json") {
      continue;
    }
    const isSourceFile = hasSourceExtension(file.relPath);
    if (isTestFile(file.relPath)) {
      if (isSourceFile) {
        testPaths.push(file.relPath);
      }
      continue;
    }
    const normalized = normalizePath(file.relPath);
    const base = basename(normalized, extname(normalized)).toLowerCase();
    const isEntry = normalized.startsWith("bin/") || ENTRYPOINT_BASE_NAMES[base] === true;
    const kind = inferKind(file.relPath);
    if (isEntry) {
      addEntrypoint({ path: file.relPath, kind });
      addModule({ path: file.relPath, kind });
    } else if (isSourceFile) {
      addModule({ path: file.relPath, kind });
    }
  }

  const moduleLookup = createModuleLookup(modules, modulesByPath);
  for (const testPath of testPaths.sort(compareCodeUnit)) {
    const candidate = findAssociatedModule(testPath, moduleLookup);
    let associated = false;
    if (candidate) {
      associated = true;
      if (reserveIndexedPath(testPath)) {
        candidate.tests = candidate.tests ?? [];
        candidate.tests.push(testPath);
      }
    }
    if (!associated) {
      addModule({ path: testPath, kind: "test" });
    }
  }


  entrypoints.sort((a, b) => compareCodeUnit(a.path, b.path));
  modules.sort((a, b) => compareCodeUnit(a.path, b.path));
  for (const mod of modules) {
    if (mod.tests) {
      mod.tests = Array.from(new Set(mod.tests)).sort(compareCodeUnit);
    }
  }
  commands.sort((a, b) => compareCodeUnit(a.name, b.name));
  verification.sort((a, b) => compareCodeUnit(a.command, b.command));

  if (options.existing) {
    const existingEntrypoints = new Map((options.existing.entrypoints ?? []).map((entry) => [entry.path, entry]));
    for (const entry of entrypoints) {
      const previous = existingEntrypoints.get(entry.path);
      if (previous) {
        const kind = stringValue(previous.kind);
        if (kind !== undefined) {
          entry.kind = kind;
        }
        const summary = stringValue(previous.summary);
        if (summary !== undefined) {
          entry.summary = summary;
        }
      }
    }

    const existingModules = new Map((options.existing.modules ?? []).map((mod) => [mod.path, mod]));
    for (const mod of modules) {
      const previous = existingModules.get(mod.path);
      if (previous) {
        const kind = stringValue(previous.kind);
        if (kind !== undefined) {
          mod.kind = kind;
        }
        const summary = stringValue(previous.summary);
        if (summary !== undefined) {
          mod.summary = summary;
        }
        const previousTests = (previous.tests ?? [])
          .filter((testPath) => filePaths.has(testPath) && hasSourceExtension(testPath))
          .sort(compareCodeUnit);
        for (const testPath of previousTests) {
          if (reserveIndexedPath(testPath)) {
            mod.tests = mod.tests ?? [];
            mod.tests.push(testPath);
          }
        }
        if (mod.tests) {
          mod.tests = Array.from(new Set(mod.tests)).sort(compareCodeUnit);
        }
      }
    }

    const existingCommands = new Map((options.existing.commands ?? []).map((cmd) => [cmd.name, cmd]));
    for (const cmd of commands) {
      const previous = existingCommands.get(cmd.name);
      if (previous) {
        const summary = stringValue(previous.summary);
        if (summary !== undefined) {
          cmd.summary = summary;
        }
      }
    }

    const existingVerification = new Map(
      (options.existing.verification ?? []).map((verify) => [verify.command, verify]),
    );
    for (const verify of verification) {
      const previous = existingVerification.get(verify.command);
      if (previous) {
        const purpose = stringValue(previous.purpose);
        if (purpose !== undefined) {
          verify.purpose = purpose;
        }
      }
    }
    for (const risk of options.existing.risks ?? []) {
      if (typeof risk.area !== "string" || RESERVED_DETERMINISTIC_RISK_AREAS[risk.area]) {
        continue;
      }
      const preservedRisk: { area: string; summary?: string } = { area: risk.area };
      const summary = stringValue(risk.summary);
      if (summary !== undefined) {
        preservedRisk.summary = summary;
      }
      risks.push(preservedRisk);
    }

  }

  const fileByPath = new Map(files.map((file) => [file.relPath, file]));
  const indexedPaths = new Set<string>();
  for (const entry of entrypoints) {
    indexedPaths.add(entry.path);
  }
  for (const mod of modules) {
    indexedPaths.add(mod.path);
    if (mod.tests) {
      for (const testPath of mod.tests) {
        indexedPaths.add(testPath);
      }
    }
  }
  const previousIndexedPaths = new Set<string>();
  for (const entry of options.existing?.entrypoints ?? []) {
    if (typeof entry.path === "string") {
      previousIndexedPaths.add(entry.path);
    }
  }
  for (const mod of options.existing?.modules ?? []) {
    if (typeof mod.path === "string") {
      previousIndexedPaths.add(mod.path);
    }
    for (const testPath of mod.tests ?? []) {
      if (typeof testPath === "string") {
        previousIndexedPaths.add(testPath);
      }
    }
  }

  const fingerprints: Record<string, FileFingerprint> = {};
  const staleFiles: string[] = [];
  const previousFingerprints = options.existing?.fingerprints ?? {};
  const hasExistingIndex = options.existing !== undefined;
  for (const relPath of Array.from(indexedPaths).sort(compareCodeUnit)) {
    const file = fileByPath.get(relPath);
    const previous = previousFingerprints[relPath];
    if (file && file.size > limits.maxFingerprintBytesPerFile) {
      recordRisk({ area: "large file skipped", summary: `Skipped fingerprint for large file: ${relPath}` });
      if (isFileFingerprint(previous)) {
        staleFiles.push(`${relPath} (changed)`);
      } else if (hasExistingIndex && !previousIndexedPaths.has(relPath)) {
        staleFiles.push(`${relPath} (added)`);
      }
      continue;
    }
    const absolute = resolve(options.cwd, relPath);
    const fp = await streamFileFingerprint(absolute, limits.maxFingerprintBytesPerFile);
    if (fp) {
      fingerprints[relPath] = fp;
      if (hasExistingIndex && previous === undefined) {
        staleFiles.push(`${relPath} (added)`);
      } else if (isFileFingerprint(previous) && (previous.size !== fp.size || previous.checksum !== fp.checksum)) {
        staleFiles.push(`${relPath} (changed)`);
      }
    } else {
      if (previous !== undefined) {
        staleFiles.push(`${relPath} (missing)`);
      }
    }
  }
  for (const relPath of Object.keys(previousFingerprints).sort(compareCodeUnit)) {
    if (!indexedPaths.has(relPath) && isSafeRelativePath(relPath) && !filePaths.has(relPath)) {
      staleFiles.push(`${relPath} (missing)`);
    }
  }
  staleFiles.sort(compareCodeUnit);

  risks.sort(compareRisk);

  const candidate: CodebaseIndex = {
    version: 1,
    entrypoints,
    modules,
    commands,
    verification,
    risks,
    fingerprints,
  };

  const changed =
    options.existing === undefined ||
    JSON.stringify(normalizeIndexPart(options.existing)) !== JSON.stringify(normalizeIndexPart(candidate));

  const generatedAt = changed
    ? options.now.toISOString()
    : options.existing?.generatedAt ?? options.now.toISOString();

  const index: CodebaseIndex = { ...candidate, generatedAt };

  return {
    index,
    changed,
    staleFiles,
    scannedFiles,
    indexedFiles: countedIndexedPaths.size,
    truncated: scanTruncated || indexedTruncated || riskTruncated,
  };
}
