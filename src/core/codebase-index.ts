import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { FileFingerprint } from "./json";
import { isSafeRelativePath } from "./validators";
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
    return { mtime: stats.mtimeMs, size: stats.size, checksum: hash.digest("hex") };
  } catch {
    return undefined;
  }
}
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
  return result.stdout.split("\0").filter((line) => line.length > 0);
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
  const entrypoints: Array<{ path: string; kind?: string; summary?: string }> = [
    { path: "package.json", kind: "package" },
  ];
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
    for (const [name, value] of Object.entries(pkg.bin).sort(([a], [b]) => a.localeCompare(b))) {
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

function findAssociatedModule(
  testPath: string,
  modules: Array<{ path: string; kind?: string; summary?: string; tests?: string[] }>,
): { path: string; kind?: string; summary?: string; tests?: string[] } | undefined {
  const sourceBase = deriveSourceBaseName(testPath);
  if (sourceBase === undefined) {
    return undefined;
  }
  const normalizedTestPath = normalizePath(testPath);
  const testDir = dirname(normalizedTestPath);
  const exactPath = normalizePath(join(testDir, sourceBase));
  const exact = modules.find((mod) => mod.path === exactPath);
  if (exact) {
    return exact;
  }
  const testDirBase = basename(testDir).toLowerCase();
  if (["__test__", "__tests__", "test", "tests"].includes(testDirBase)) {
    const parentPath = normalizePath(join(dirname(testDir), sourceBase));
    const parent = modules.find((mod) => mod.path === parentPath);
    if (parent) {
      return parent;
    }
  }
  const matches = modules.filter((mod) => basename(mod.path).toLowerCase() === sourceBase.toLowerCase());
  if (matches.length === 1) {
    return matches[0];
  }
  return undefined;
}

interface NormalizedIndexPart {
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
  const fingerprints = Object.entries(index.fingerprints ?? {})
    .filter((entry): entry is [string, FileFingerprint] => isFileFingerprint(entry[1]))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fp]) => [path, { mtime: fp.mtime, size: fp.size, checksum: fp.checksum }] as [string, { mtime: number; size: number; checksum: string }]);
  return { entrypoints, modules, commands, verification, risks, fingerprints };
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
    for (const entry of packageEntrypointCandidates(pkg, filePaths)) {
      if (!checkIndexedCap()) {
        entrypoints.push(entry);
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
    const candidate = findAssociatedModule(testPath, modules);
    let associated = false;
    if (candidate) {
      associated = true;
      if (!checkIndexedCap()) {
        candidate.tests = candidate.tests ?? [];
        candidate.tests.push(testPath);
        indexedFiles++;
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

  const fingerprints: Record<string, FileFingerprint> = {};
  const staleFiles: string[] = [];
  const previousFingerprints = options.existing?.fingerprints ?? {};
  for (const relPath of Array.from(indexedPaths).sort((a, b) => a.localeCompare(b))) {
    const file = fileByPath.get(relPath);
    if (file && file.size > limits.maxFingerprintBytesPerFile) {
      continue;
    }
    const absolute = resolve(options.cwd, relPath);
    const fp = await streamFileFingerprint(absolute, limits.maxFingerprintBytesPerFile);
    if (fp) {
      fingerprints[relPath] = fp;
      const previous = previousFingerprints[relPath];
      if (
        isFileFingerprint(previous) &&
        (previous.mtime !== fp.mtime || previous.size !== fp.size || previous.checksum !== fp.checksum)
      ) {
        staleFiles.push(`${relPath} (changed)`);
      }
    } else {
      const previous = previousFingerprints[relPath];
      if (previous !== undefined) {
        staleFiles.push(`${relPath} (missing)`);
      }
    }
  }
  for (const relPath of Object.keys(previousFingerprints).sort((a, b) => a.localeCompare(b))) {
    if (!indexedPaths.has(relPath) && isSafeRelativePath(relPath) && !filePaths.has(relPath)) {
      staleFiles.push(`${relPath} (missing)`);
    }
  }
  staleFiles.sort((a, b) => a.localeCompare(b));

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
    indexedFiles,
    truncated: scanTruncated || indexedTruncated,
  };
}
