import { join } from "node:path";
import { OMP_DIR, SPECWRIGHT_DIR } from "./types";

export function specwrightDir(cwd: string): string {
  return join(cwd, SPECWRIGHT_DIR);
}

export function configPath(cwd: string): string {
  return join(specwrightDir(cwd), "config.json");
}

export function statePath(cwd: string): string {
  return join(specwrightDir(cwd), "state.json");
}

export function projectDir(cwd: string): string {
  return join(specwrightDir(cwd), "project");
}

export function changesDir(cwd: string): string {
  return join(specwrightDir(cwd), "changes");
}

export function changeDir(cwd: string, changeId: string, slug: string): string {
  return join(changesDir(cwd), `${changeId}-${slug}`);
}

export function packsDir(cwd: string): string {
  return join(specwrightDir(cwd), "packs");
}

export function ompExtensionDir(cwd: string): string {
  return join(cwd, OMP_DIR, "extensions", "specwright");
}

export function ompAgentsDir(cwd: string): string {
  return join(cwd, OMP_DIR, "agents");
}

export function ompRulesDir(cwd: string): string {
  return join(cwd, OMP_DIR, "rules");
}
