import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface FileFingerprint {
  mtime: number;
  size: number;
  checksum: string;
}

export async function computeFileFingerprint(path: string): Promise<FileFingerprint | undefined> {
  try {
    const stats = await stat(path);
    const content = await readFile(path);
    const checksum = createHash("sha256").update(content).digest("hex");
    return { mtime: stats.mtimeMs, size: stats.size, checksum };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
function safeReviver(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null) {
    if (Object.hasOwn(value, "__proto__") || Object.hasOwn(value, "constructor")) {
      throw new Error("Invalid JSON: prototype pollution attempt detected.");
    }
  }
  return value;
}

export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"), safeReviver) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
