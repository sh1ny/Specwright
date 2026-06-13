import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { ChangeState, SpecwrightConfig } from "./types";
import { changeDir, specwrightDir } from "./paths";

export interface ProcessRunResult {
  command: string;
  args: readonly string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface GitStreamResult {
  command: "git";
  args: readonly string[];
  exitCode: number;
  stderr: string;
  stopped: boolean;
  truncated: boolean;
  bytesRead: number;
}

function mergeEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return overrides ? { ...process.env, ...overrides } : process.env;
}

async function runProcess(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  return await new Promise<ProcessRunResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: mergeEnv(options.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      resolve({ command, args, exitCode: 127, stdout, stderr: error.message });
    });

    child.on("close", (code) => {
      resolve({ command, args, exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function throwIfFailed(result: ProcessRunResult, action: string): void {
  if (result.exitCode === 0) return;
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
  throw new Error(`${action} failed: ${detail}`);
}

export async function runGit(cwd: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<ProcessRunResult> {
  return await runProcess("git", args, env ? { cwd, env } : { cwd });
}

export async function runGitNulSeparated(
  cwd: string,
  args: readonly string[],
  onItem: (item: string) => boolean | Promise<boolean>,
  options?: { env?: NodeJS.ProcessEnv; maxStdoutBytes?: number },
): Promise<GitStreamResult> {
  return await new Promise<GitStreamResult>((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: mergeEnv(options?.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let leftover: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stopped = false;
    let truncated = false;
    let bytesRead = 0;
    let settled = false;
    let pending = Promise.resolve();

    function terminate(): void {
      if (!child.killed) {
        child.kill();
      }
    }

    function finish(exitCode: number): void {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ command: "git", args, exitCode, stderr, stopped, truncated, bytesRead });
    }

    async function processChunk(chunk: Buffer<ArrayBufferLike>): Promise<void> {
      if (stopped || truncated) {
        return;
      }
      const maxStdoutBytes = options?.maxStdoutBytes;
      const previousBytesRead = bytesRead;
      bytesRead += chunk.length;

      let retainedChunk = chunk;
      if (maxStdoutBytes !== undefined && bytesRead > maxStdoutBytes) {
        truncated = true;
        const allowedChunkBytes = Math.max(0, maxStdoutBytes - previousBytesRead);
        retainedChunk = chunk.subarray(0, allowedChunkBytes);
      }

      const data = leftover.length === 0 ? retainedChunk : Buffer.concat([leftover, retainedChunk]);
      let start = 0;
      for (let index = 0; index < data.length; index += 1) {
        if (data[index] !== 0) {
          continue;
        }
        const item = data.subarray(start, index).toString("utf8");
        start = index + 1;
        if (item.length === 0) {
          continue;
        }
        if ((await onItem(item)) === false) {
          stopped = true;
          terminate();
          leftover = Buffer.alloc(0);
          return;
        }
      }
      leftover = data.subarray(start);
      if (truncated) {
        terminate();
      }
    }

    child.stdout.on("data", (chunk: Buffer<ArrayBufferLike>) => {
      child.stdout.pause();
      pending = pending
        .then(async () => {
          await processChunk(chunk);
        })
        .catch((error: unknown) => {
          stderr += `${error instanceof Error ? error.message : String(error)}\n`;
          stopped = true;
          terminate();
        })
        .finally(() => {
          if (!stopped && !truncated) {
            child.stdout.resume();
          }
        });
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      stderr = error.message;
      finish(127);
    });

    child.on("close", (code) => {
      void pending.finally(() => {
        finish(code ?? 1);
      });
    });
  });
}

export async function runGh(cwd: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<ProcessRunResult> {
  return await runProcess("gh", args, {
    cwd,
    env: {
      ...env,
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

export async function isGitWorktree(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function hasGitIdentity(cwd: string): Promise<boolean> {
  const name = await runGit(cwd, ["config", "user.name"]);
  const email = await runGit(cwd, ["config", "user.email"]);
  return name.exitCode === 0 && name.stdout.trim() !== "" && email.exitCode === 0 && email.stdout.trim() !== "";
}

export async function gitWorktreeRoot(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) return undefined;
  const root = result.stdout.trim();
  return root === "" ? undefined : root;
}

const MAX_BRANCH_NAME_LENGTH = 48;

function truncateSlugForBranch(prefix: string, slug: string): string {
  const available = MAX_BRANCH_NAME_LENGTH - prefix.length;
  if (available <= 0 || slug.length <= available) {
    return slug;
  }
  return slug.slice(0, available).replace(/-+$/g, "");
}

export function branchNameForChange(change: Pick<ChangeState, "kind" | "id" | "slug">): string {
  const prefix = `${change.kind}/${change.id}-`;
  return `${prefix}${truncateSlugForBranch(prefix, change.slug)}`;
}

export async function switchToBranch(cwd: string, branch: string): Promise<ProcessRunResult> {
  const create = await runGit(cwd, ["switch", "--create", branch]);
  if (create.exitCode === 0) return create;

  const existing = await runGit(cwd, ["switch", branch]);
  throwIfFailed(existing, "git switch");
  return existing;
}

export async function stageFiles(cwd: string, files: readonly string[]): Promise<ProcessRunResult> {
  if (files.length === 0) {
    throw new Error("No files specified to stage.");
  }
  const result = await runGit(cwd, ["add", "--", ...files]);
  throwIfFailed(result, "git add");
  return result;
}

export async function commitStaged(cwd: string, message: string, body?: string, files?: readonly string[]): Promise<ProcessRunResult> {
  if (message.trim() === "") {
    throw new Error("Commit message is required.");
  }
  const args = ["commit", "-m", message];
  if (body && body.trim() !== "") {
    args.push("-m", body);
  }
  if (files && files.length > 0) {
    args.push("--", ...files);
  }
  const result = await runGit(cwd, args);
  throwIfFailed(result, "git commit");
  return result;
}
export async function currentBranch(cwd: string): Promise<string> {
  const result = await runGit(cwd, ["branch", "--show-current"]);
  throwIfFailed(result, "git branch");
  const branch = result.stdout.trim();
  if (branch === "") {
    throw new Error("Cannot publish from a detached HEAD.");
  }
  return branch;
}
export async function isWorktreeClean(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["status", "--porcelain"]);
  if (result.exitCode !== 0) {
    throw new Error("git status failed");
  }
  return result.stdout.trim() === "";
}

export async function switchToExistingBranch(cwd: string, branch: string): Promise<ProcessRunResult> {
  const result = await runGit(cwd, ["switch", branch]);
  throwIfFailed(result, "git switch");
  return result;
}

export async function mergeNoFastForward(cwd: string, branch: string): Promise<ProcessRunResult> {
  const result = await runGit(cwd, ["merge", "--no-ff", "--no-edit", branch]);
  throwIfFailed(result, "git merge");
  return result;
}


export async function pushBranch(cwd: string, remote: string, branch: string): Promise<ProcessRunResult> {
  const result = await runGit(cwd, ["push", "-u", remote, branch]);
  throwIfFailed(result, "git push");
  return result;
}

export async function createPullRequest(
  cwd: string,
  title: string,
  bodyFile: string,
  baseBranch: string,
  headBranch: string,
): Promise<ProcessRunResult> {
  const result = await runGh(cwd, [
    "pr",
    "create",
    "--title",
    title,
    "--body-file",
    bodyFile,
    "--base",
    baseBranch,
    "--head",
    headBranch,
  ]);
  throwIfFailed(result, "gh pr create");
  return result;
}

export async function resolveBaseBranch(cwd: string, config: SpecwrightConfig): Promise<string> {
  const configured = config.workflow.baseBranch?.trim();
  if (configured) return configured;

  const remote = config.workflow.remote;
  const result = await runGit(cwd, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`]);
  if (result.exitCode === 0) {
    const ref = result.stdout.trim();
    if (ref.startsWith(`${remote}/`)) return ref.slice(remote.length + 1);
    if (ref !== "") return ref;
  }

  return "main";
}

interface PullRequestBodyPart {
  file: string;
  headings?: readonly string[];
}

interface PullRequestBodySection {
  title: string;
  parts: readonly PullRequestBodyPart[];
}

const PR_BODY_SECTIONS: readonly PullRequestBodySection[] = [
  { title: "Summary", parts: [{ file: "intent.md", headings: ["Goal"] }] },
  { title: "Changes", parts: [{ file: "plan.md", headings: ["Decision", "Implementation plan"] }, { file: "tasks.md" }] },
  { title: "Verification", parts: [{ file: "verify.md" }] },
  { title: "Key Decisions", parts: [{ file: "decisions.md", headings: ["Settled", "Deferred"] }] },
  { title: "Evidence / Sources", parts: [{ file: "evidence.md" }, { file: "sources.md" }] },
  { title: "Handoff / Next Steps", parts: [{ file: "handoff.md" }] },
] as const;

async function readArtifact(cwd: string, change: ChangeState, file: string): Promise<string | undefined> {
  try {
    return await readFile(join(changeDir(cwd, change.id, change.slug), file), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isBoilerplateLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("<frozen-after-approval") ||
    trimmed.startsWith("</frozen-after-approval") ||
    trimmed.startsWith("# ")
  );
}

function hasSubstantiveContent(lines: readonly string[]): boolean {
  return lines.some((line) => {
    const trimmed = line.trim();
    return trimmed !== "" && !trimmed.startsWith("#") && !trimmed.startsWith("<!--") && !trimmed.startsWith("<");
  });
}

function trimEmptyEdges(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.trim() === "") end -= 1;
  return lines.slice(start, end);
}

function demoteHeading(line: string): string {
  return line.replace(/^(#{2,5})(\s+)/, "#$1$2");
}

function keepArtifactHeading(markdown: string, allowedHeadings?: readonly string[]): string {
  const allowed = allowedHeadings ? new Set(allowedHeadings) : undefined;
  const lines = markdown.split(/\r?\n/).filter((line) => !isBoilerplateLine(line));
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (!heading) {
      if (!allowed && line.trim() !== "") output.push(line);
      index += 1;
      continue;
    }

    const title = heading[2] ?? "";
    const group: string[] = [line];
    index += 1;
    while (index < lines.length && !/^#{2,6}\s+/.test(lines[index] ?? "")) {
      group.push(lines[index] ?? "");
      index += 1;
    }

    if ((!allowed || allowed.has(title)) && hasSubstantiveContent(group.slice(1))) {
      output.push(...trimEmptyEdges(group).map(demoteHeading));
    }
  }

  return trimEmptyEdges(output).join("\n");
}

export async function generatePullRequestBody(cwd: string, change: ChangeState): Promise<string> {
  const sections: string[] = [];

  for (const section of PR_BODY_SECTIONS) {
    const parts: string[] = [];
    for (const part of section.parts) {
      const artifact = await readArtifact(cwd, change, part.file);
      if (!artifact) continue;
      const content = keepArtifactHeading(artifact, part.headings);
      if (content.trim() !== "") parts.push(content);
    }
    if (parts.length > 0) {
      sections.push(`## ${section.title}\n\n${parts.join("\n\n")}`);
    }
  }

  return `${sections.join("\n\n")}\n`;
}

export async function writePullRequestBodyFile(cwd: string, change: ChangeState): Promise<string> {
  const dir = join(specwrightDir(cwd), "tmp");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `pull-request-${change.id}-${change.slug}.md`);
  await writeFile(path, await generatePullRequestBody(cwd, change), "utf8");
  return path;
}
