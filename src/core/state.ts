import { basename } from "node:path";
import { configPath, statePath } from "./paths";
import { readJsonFile, writeJsonFile } from "./json";
import type { ChangeState, SpecwrightConfig, SpecwrightState } from "./types";

type StoredSpecwrightConfig = Partial<Omit<SpecwrightConfig, "workflow">> & {
  version?: unknown;
  workflow?: Partial<SpecwrightConfig["workflow"]>;
};

export function defaultConfig(projectName: string): SpecwrightConfig {
  return {
    version: 1,
    project: { name: projectName },
    defaults: {
      mode: "lite",
      pack: "core",
      onlineResearch: "auto",
      maxContextFiles: 6,
      maxOutputWords: 1200,
    },
    packs: {
      roots: [".specwright/packs", "packs"],
      enabled: ["core"],
    },
    runtimes: {
      omp: { enabled: true },
    },
    workflow: {
      autoCommit: true,
      publishMode: "none",
      remote: "origin",
    },
  };
}

export function defaultState(now: Date): SpecwrightState {
  return {
    version: 1,
    changes: {},
    updatedAt: now.toISOString(),
  };
}

export async function loadConfig(cwd: string): Promise<SpecwrightConfig> {
  const existing = await readJsonFile<StoredSpecwrightConfig>(configPath(cwd));
  const defaults = defaultConfig(basename(cwd));
  if (!existing) {
    return defaults;
  }
  if (existing.version !== 1) {
    throw new Error(`Unsupported Specwright config version: ${String(existing.version)}`);
  }

  return {
    version: 1,
    project: {
      ...defaults.project,
      ...existing.project,
    },
    defaults: {
      ...defaults.defaults,
      ...existing.defaults,
    },
    packs: {
      ...defaults.packs,
      ...existing.packs,
    },
    runtimes: {
      omp: {
        ...defaults.runtimes.omp,
        ...existing.runtimes?.omp,
      },
    },
    workflow: {
      ...defaults.workflow,
      ...existing.workflow,
    },
  };
}

export async function loadState(cwd: string): Promise<SpecwrightState> {
  const state = await readJsonFile<SpecwrightState & { version?: unknown }>(statePath(cwd));
  if (!state) {
    return defaultState(new Date());
  }
  if (state.version !== 1) {
    throw new Error(`Unsupported Specwright state version: ${String(state.version)}`);
  }
  return state as SpecwrightState;
}

export async function saveConfig(cwd: string, config: SpecwrightConfig): Promise<void> {
  await writeJsonFile(configPath(cwd), config);
}

export async function saveState(cwd: string, state: SpecwrightState): Promise<void> {
  await writeJsonFile(statePath(cwd), state);
}

export async function findCurrentChange(cwd: string, explicit?: string): Promise<ChangeState> {
  const state = await loadState(cwd);
  const target = explicit ?? state.currentChange;
  if (!target) {
    throw new Error("No current Specwright change. Run specwright new <kind> \"<title>\" first.");
  }

  const direct = state.changes[target];
  if (direct) {
    return direct;
  }

  for (const change of Object.values(state.changes)) {
    if (change.id === target || `${change.id}-${change.slug}` === target || change.id === target.slice(0, 4)) {
      return change;
    }
  }

  throw new Error(`Specwright change not found: ${target}`);
}

export async function upsertChange(cwd: string, change: ChangeState): Promise<void> {
  const state = await loadState(cwd);
  state.changes[change.id] = change;
  state.currentChange = change.id;
  state.updatedAt = change.updatedAt;
  await saveState(cwd, state);
}
