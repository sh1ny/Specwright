import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { FileFingerprint } from "./json";
import { runGit } from "./git";

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
    maxIndexedFiles: number;
    maxFingerprintBytesPerFile: number;
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
export const MAX_INDEXED_FILES = 5000;
export const MAX_FINGERPRINT_BYTES_PER_FILE = 1048576;

export const RESERVED_DETERMINISTIC_RISK_AREAS: Record<string, true> = {
  "scan coverage": true,
  "large file skipped": true,
  "symlink skipped": true,
};

const DEFAULT_LIMITS = {
  maxFilesScanned: MAX_FILES_SCANNED,
  maxIndexedFiles: MAX_INDEXED_FILES,
  maxFingerprintBytesPerFile: MAX_FINGERPRINT_BYTES_PER_FILE,
} as const;

const EXCLUDE_PREFIXES = [
  ".git/",
  "node_modules/",
  ".specwright/cache/",
  ".specwright/tmp/",
  ".omp/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "target/",
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

const ENTRYPOINT_BASE_NAMES: Record<string, true> = {
  cli: true,
  main: true,
  index: true,
  server: true,
  app: true,
};

interface DiscoveredFile {
  relPath: string;
  absolute: string;
  size: number;
}

function normalizePath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

function shouldExclude(relPath: string): boolean {
  const normalized = normalizePath(relPath);
  for (const prefix of EXCLUDE_PREFIXES) {
    const dirName = prefix.slice(0, -1);
    if (normalized === dirName || normalized.startsWith(prefix)) {
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
  return /[\\/](?:__tests?__|tests?)(?:[\\/]|$)/i.test(normalizePath(relPath));
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

async function tryGitFileList(cwd: string): Promise<string[] | undefined> {
  const result = await runGit(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (result.exitCode !== 0) {
    return undefined;
  }
  return result.stdout
    .split("\0")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function discoverFiles(
  cwd: string,
  maxFilesScanned: number,
  risks: Array<{ area: string; summary?: string }>,
): Promise<{ files: DiscoveredFile[]; scannedFiles: number; truncated: boolean }> {
  const gitFiles = await tryGitFileList(cwd);
  if (gitFiles !== undefined) {
    const files: DiscoveredFile[] = [];
    for (const relPath of gitFiles.sort((a, b) => a.localeCompare(b))) {
      if (shouldExclude(relPath)) {
        continue;
      }
      if (files.length >= maxFilesScanned) {
        return { files, scannedFiles: files.length, truncated: true };
      }
      const absolute = resolve(cwd, relPath);
      try {
        const st = await lstat(absolute);
        if (st.isSymbolicLink()) {
          risks.push({ area: "symlink skipped", summary: `Skipped symlinked path: ${relPath}` });
          continue;
        }
        if (st.isFile()) {
          files.push({ relPath, absolute, size: st.size });
        }
      } catch {
        // Ignore paths that disappeared or are inaccessible.
      }
    }
    return { files, scannedFiles: files.length, truncated: false };
  }

  const files: DiscoveredFile[] = [];
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (truncated) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      if (truncated) {
        break;
      }
      const absolute = join(dir, entry.name);
      const relPath = normalizePath(relative(cwd, absolute));
      if (shouldExclude(relPath)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        risks.push({ area: "symlink skipped", summary: `Skipped symlinked path: ${relPath}` });
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        try {
          const st = await stat(absolute);
          files.push({ relPath, absolute, size: st.size });
          if (files.length >= maxFilesScanned) {
            truncated = true;
            break;
          }
        } catch {
          // Ignore files that disappeared during the walk.
        }
      }
    }
  }

  await walk(cwd);
  return { files, scannedFiles: files.length, truncated };
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
    return JSON.parse(content) as PackageInfo;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addPackageEntrypoints(pkg: PackageInfo, entrypoints: Array<{ path: string; kind?: string; summary?: string }>): void {
  entrypoints.push({ path: "package.json", kind: "package" });
  if (typeof pkg.main === "string") {
    entrypoints.push({ path: pkg.main, kind: "main" });
  }
  if (typeof pkg.module === "string") {
    entrypoints.push({ path: pkg.module, kind: "module" });
  }
  if (typeof pkg.bin === "string") {
    entrypoints.push({ path: pkg.bin, kind: "bin" });
  } else if (isRecord(pkg.bin)) {
    for (const [name, path] of Object.entries(pkg.bin).sort(([a], [b]) => a.localeCompare(b))) {
      if (typeof path === "string") {
        entrypoints.push({ path, kind: "bin", summary: `bin command: ${name}` });
      }
    }
  }
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
  for (const name of Object.keys(pkg.scripts).sort()) {
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

interface NormalizedIndexPart {
  entrypoints: Array<{ path: string; kind?: string; summary?: string }>;
  modules: Array<{ path: string; kind?: string; summary?: string; tests: string[] }>;
  commands: Array<{ name: string; summary?: string }>;
  verification: Array<{ command: string; purpose?: string }>;
  risks: Array<{ area: string; summary?: string }>;
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
    .sort((a, b) => a.path.localeCompare(b.path));
  const modules = (index.modules ?? [])
    .map((mod) => {
      const out: { path: string; kind?: string; summary?: string; tests: string[] } = {
        path: mod.path,
        tests: [...(mod.tests ?? [])].sort(),
      };
      if (mod.kind !== undefined) {
        out.kind = mod.kind;
      }
      if (mod.summary !== undefined) {
        out.summary = mod.summary;
      }
      return out;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const commands = [...(index.commands ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const verification = [...(index.verification ?? [])].sort((a, b) => a.command.localeCompare(b.command));
  const risks = [...(index.risks ?? [])].sort((a, b) => {
    const aKey = `${a.area}:${a.summary ?? ""}`;
    const bKey = `${b.area}:${b.summary ?? ""}`;
    return aKey.localeCompare(bKey);
  });
  return { entrypoints, modules, commands, verification, risks };
}

export async function buildCodebaseIndex(options: BuildCodebaseIndexOptions): Promise<BuildCodebaseIndexResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const risks: Array<{ area: string; summary?: string }> = [];

  const { files, scannedFiles, truncated: scanTruncated } = await discoverFiles(
    options.cwd,
    limits.maxFilesScanned,
    risks,
  );
  if (scanTruncated) {
    risks.push({
      area: "scan coverage",
      summary: `Scanned file cap of ${limits.maxFilesScanned} exceeded; discovery stopped.`,
    });
  }

  const filePaths = new Set(files.map((file) => file.relPath));
  const pkg = await readPackageInfo(options.cwd);

  const entrypoints: Array<{ path: string; kind?: string; summary?: string }> = [];
  const modules: Array<{ path: string; kind?: string; summary?: string; tests?: string[] }> = [];
  const commands: Array<{ name: string; summary?: string }> = [];
  const verification: Array<{ command: string; purpose?: string }> = [];
  let indexedFiles = 0;
  let indexedTruncated = false;

  function checkIndexedCap(): boolean {
    if (indexedFiles >= limits.maxIndexedFiles) {
      indexedTruncated = true;
      return true;
    }
    return false;
  }

  if (pkg) {
    const before = entrypoints.length;
    addPackageEntrypoints(pkg, entrypoints);
    for (const entry of entrypoints.slice(before)) {
      if (checkIndexedCap()) {
        entrypoints.pop();
      } else {
        indexedFiles++;
      }
    }
    addPackageVerification(pkg, verification);
    addPackageCommands(pkg, commands);
  }

  const testPaths: string[] = [];

  for (const file of files) {
    if (file.relPath === "package.json") {
      continue;
    }
    if (file.size > limits.maxFingerprintBytesPerFile) {
      risks.push({ area: "large file skipped", summary: `Skipped fingerprint for large file: ${file.relPath}` });
    }
    if (isTestFile(file.relPath)) {
      testPaths.push(file.relPath);
      continue;
    }
    const normalized = normalizePath(file.relPath);
    const base = basename(normalized, extname(normalized)).toLowerCase();
    const isEntry = normalized.startsWith("bin/") || ENTRYPOINT_BASE_NAMES[base] === true;
    const kind = inferKind(file.relPath);
    if (isEntry) {
      if (!checkIndexedCap()) {
        entrypoints.push({ path: file.relPath, kind });
        indexedFiles++;
      }
      if (!checkIndexedCap()) {
        modules.push({ path: file.relPath, kind });
        indexedFiles++;
      }
    } else if (SOURCE_EXTENSIONS[extname(file.relPath).toLowerCase()] === true) {
      if (!checkIndexedCap()) {
        modules.push({ path: file.relPath, kind });
        indexedFiles++;
      }
    }
  }

  for (const testPath of testPaths.sort()) {
    const sourceBase = deriveSourceBaseName(testPath);
    let associated = false;
    if (sourceBase) {
      const candidate = modules.find(
        (mod) => basename(mod.path).toLowerCase() === sourceBase.toLowerCase(),
      );
      if (candidate) {
        candidate.tests = candidate.tests ?? [];
        candidate.tests.push(testPath);
        associated = true;
      }
    }
    if (!associated) {
      if (!checkIndexedCap()) {
        modules.push({ path: testPath, kind: "test" });
        indexedFiles++;
      }
    }
  }

  if (indexedTruncated) {
    risks.push({
      area: "scan coverage",
      summary: `Indexed file cap of ${limits.maxIndexedFiles} exceeded; candidate list truncated.`,
    });
  }

  entrypoints.sort((a, b) => a.path.localeCompare(b.path));
  modules.sort((a, b) => a.path.localeCompare(b.path));
  for (const mod of modules) {
    if (mod.tests) {
      mod.tests = Array.from(new Set(mod.tests)).sort();
    }
  }
  commands.sort((a, b) => a.name.localeCompare(b.name));
  verification.sort((a, b) => a.command.localeCompare(b.command));
  risks.sort((a, b) => {
    const aKey = `${a.area}:${a.summary ?? ""}`;
    const bKey = `${b.area}:${b.summary ?? ""}`;
    return aKey.localeCompare(bKey);
  });

  if (options.existing) {
    const existingEntrypoints = new Map((options.existing.entrypoints ?? []).map((entry) => [entry.path, entry]));
    for (const entry of entrypoints) {
      const previous = existingEntrypoints.get(entry.path);
      if (previous) {
        if (previous.kind !== undefined) {
          entry.kind = previous.kind;
        }
        if (previous.summary !== undefined) {
          entry.summary = previous.summary;
        }
      }
    }

    const existingModules = new Map((options.existing.modules ?? []).map((mod) => [mod.path, mod]));
    for (const mod of modules) {
      const previous = existingModules.get(mod.path);
      if (previous) {
        if (previous.kind !== undefined) {
          mod.kind = previous.kind;
        }
        if (previous.summary !== undefined) {
          mod.summary = previous.summary;
        }
        const previousTests = previous.tests ?? [];
        const merged = Array.from(
          new Set([...(mod.tests ?? []), ...previousTests.filter((testPath) => filePaths.has(testPath))]),
        ).sort();
        if (merged.length > 0) {
          mod.tests = merged;
        }
      }
    }

    const existingCommands = new Map((options.existing.commands ?? []).map((cmd) => [cmd.name, cmd]));
    for (const cmd of commands) {
      const previous = existingCommands.get(cmd.name);
      if (previous && previous.summary !== undefined) {
        cmd.summary = previous.summary;
      }
    }

    const existingVerification = new Map(
      (options.existing.verification ?? []).map((verify) => [verify.command, verify]),
    );
    for (const verify of verification) {
      const previous = existingVerification.get(verify.command);
      if (previous && previous.purpose !== undefined) {
        verify.purpose = previous.purpose;
      }
    }
    for (const risk of options.existing.risks ?? []) {
      if (!RESERVED_DETERMINISTIC_RISK_AREAS[risk.area]) {
        risks.push(risk);
      }
    }

    risks.sort((a, b) => {
      const aKey = `${a.area}:${a.summary ?? ""}`;
      const bKey = `${b.area}:${b.summary ?? ""}`;
      return aKey.localeCompare(bKey);
    });
  }

  const index: CodebaseIndex = {
    version: 1,
    generatedAt: options.now.toISOString(),
    entrypoints,
    modules,
    commands,
    verification,
    risks,
    fingerprints: {},
  };

  const changed =
    options.existing === undefined ||
    JSON.stringify(normalizeIndexPart(options.existing)) !== JSON.stringify(normalizeIndexPart(index));

  return {
    index,
    changed,
    staleFiles: [],
    scannedFiles,
    indexedFiles,
    truncated: scanTruncated || indexedTruncated,
  };
}
