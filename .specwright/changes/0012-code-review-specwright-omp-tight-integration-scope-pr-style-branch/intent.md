# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

## Users

## Non-goals

</frozen-after-approval>

## Approval notes
### Source request
@REVIEW-0011-OMP-INTEGRATION.md
### Expanded request
# Code Review: Specwright OMP Tight Integration

**Scope**: PR-style branch diff, `main...refactor/0011-specwright-omp-tight-integration-p`  
**Files reviewed**: 26 files, +2513/-83  
**Method**: 8 parallel reviewer agents by locality, plus spot-checks against the branch ref and current OMP source.  

Note: this review targets the committed branch ref, not uncommitted local workspace fixes.

---

## Findings

### [HIGH] Bug: OMP tool registration uses obsolete API and crashes startup

**File**: `src/runtime/omp/extension.ts` (lines 56-120)

**Issue**: The branch calls:

```ts
pi.registerTool("specwright_status", { ... handler ... })
```

Current OMP expects:

```ts
pi.registerTool({
  name,
  label,
  description,
  parameters,
  execute,
})
```

**Why it matters**: OMP receives a string where it expects a tool definition object. This matches the observed crash:

```txt
TypeError: Reflect.ownKeys requires the first argument be an object
```

**Suggestion**: Convert all three tools to object-form registration with `name`, `label`, `parameters`, and `execute(...)`, returning OMP `AgentToolResult` shape.

---

### [HIGH] Bug: lifecycle tool-call blocker reads stale event shape

**File**: `src/runtime/omp/extension.ts` (lines 121-134)

**Issue**: Branch code checks `toolCall.name` and `toolCall.params`, but current OMP emits `toolName` and `input`.

**Why it matters**: Even a correct `task` call will not clear `pendingRoute`; the extension can block valid lifecycle delegation and produce `received tool undefined`.

**Suggestion**: Use:

```ts
const isTask = toolCall.toolName === "task";
const agent = typeof toolCall.input?.agent === "string" ? toolCall.input.agent : undefined;
```

---

### [HIGH] Bug: passive OMP status refresh mutates verification artifacts/state

**File**: `src/runtime/omp/status.ts` (line 122)

**Issue**: `refreshStatus()` calls:

```ts
runSpecwrightCommand(..., ["verify", "--json"])
```

`verify` writes `verify.md` and can update change status/state.

**Why it matters**: Passive UI events (`session_start`, `goal_updated`, `turn_end`) can overwrite verification artifacts and advance workflow state before the user asks to verify.

**Suggestion**: Add a non-mutating validation path for status classification, or call validator functions directly without writing `verify.md`/state.

---

### [HIGH] Bug: status refresh race remains before in-flight guard is set

**File**: `src/runtime/omp/status.ts` (lines 72-84)

**Issue**: `loadStatusText()` awaits `loadState()` and artifact `stat()` work before inserting the promise into `refreshInFlightByCwd`.

**Why it matters**: Concurrent refreshes can both pass the empty-map check and then both run mutating `status --json` / `verify --json`, reopening the state temp-file rename race the guard was intended to prevent.

**Suggestion**: Put all async work inside the shared pending promise, or set/recheck `refreshInFlightByCwd` before the first `await`.

---

### [HIGH] Bug: stale adapter marker forces overwrite of user-owned OMP files

**File**: `src/runtime/omp/install.ts` (lines 145-147), `src/core/commands.ts` init/config install paths

**Issue**: `adapterNeedsRegeneration()` returns `true` when the package marker is missing/stale. Callers pass that directly as `force` to `installOmpAdapter`.

**Why it matters**: A normal upgrade can overwrite `.omp/extensions/specwright/index.ts`, `.omp/rules/specwright-workflow.md`, and generated agent cards even when the user did not pass `--force`.

**Suggestion**: Separate “package marker needs regeneration” from global force. Rewrite only known generated adapter files, and preserve existing rule/agent files unless `--force` or explicit agent regeneration is requested.

---

### [MEDIUM] Bug: failed lifecycle command leaves stale route blocker armed

**File**: `src/runtime/omp/extension.ts` (lines 29-32)

**Issue**: `pendingRoute` is set before `runSpecwrightCommand()` succeeds or emits a prompt.

**Why it matters**: `plan 0001` on a missing/invalid change can fail with no prompt, but the next unrelated tool call is still blocked as if lifecycle routing were active.

**Suggestion**: Set `pendingRoute` only after `result.ok && result.prompt`, or clear it whenever the command returns without a prompt.

---

### [MEDIUM] Test Gap: tests mock the obsolete OMP tool API

**File**: `test/omp-extension.test.ts` (tool registration tests around lines 484-663)

**Issue**: Tests define `registerTool(name, definition)` and assert `.handler`, matching the fake local type rather than real OMP.

**Why it matters**: The test suite passed while the extension crashed OMP at startup.

**Suggestion**: Update tests to object-form `registerTool(definition)`, assert `definition.name`, call `definition.execute(...)`, and validate returned `{ content, details }`.

---

### [MEDIUM] Test Gap: lifecycle routing tests pass after failed commands

**File**: `test/omp-extension.test.ts` (around lines 689-690)

**Issue**: Tests call lifecycle commands in a fresh temp dir without creating change `0001`.

**Why it matters**: The command fails, emits no prompt, but tests still pass because `pendingRoute` is set too early. This hides both missing prompt generation and stale route bugs.

**Suggestion**: Initialize a real change and assert the command produced/sent a lifecycle prompt before asserting tool-call blocking.

---

### [MEDIUM] Test Gap: checkpoint forwarding test does not prove argv forwarding

**File**: `test/omp-extension.test.ts` (around lines 662-666)

**Issue**: The “valid params” checkpoint test runs in a non-git temp dir and only checks that tool-layer validation strings are absent.

**Why it matters**: If the tool drops `--phase` or `--files`, the core command can still fail with a different validation/git error and the test passes.

**Suggestion**: Spy on `runSpecwrightCommand` and assert exact argv, or run in a real git worktree and expect the command to pass argument validation.

---

### [MEDIUM] Workflow Artifact: verification claims manual OMP checks that are not evidenced

**File**: `.specwright/changes/0011-specwright-omp-tight-integration-plan-context-specwright-s-omp-integration/verify.md` (lines 47-56)

**Issue**: `verify.md` reports PASS and T009 is checked complete, but required manual OMP scenarios are not recorded; only typecheck/Bun test output is evidenced.

**Why it matters**: Future agents will treat manual integration acceptance as complete when it was not observed.

**Suggestion**: Run and record the manual OMP scenarios, or uncheck T009/remove PASS until verified.

---

### [LOW] State metadata: stored change title contains raw Markdown/context prose

**File**: `.specwright/state.json` (line 452)

**Issue**: The new state entry title includes raw heading/context text instead of a clean title.

**Why it matters**: This can leak into generated metadata, including PR title construction.

**Suggestion**: Replace with the intended plain change title and keep slug/artifact metadata aligned.

---

## Summary

| Severity | Count |
|---|---:|
| CRITICAL | 0 |
| HIGH | 5 |
| MEDIUM | 5 |
| LOW | 1 |

## Recommended Actions

1. Fix OMP API compatibility first: `registerTool` object form, `execute`, tool result shape, `toolName/input`.
2. Fix passive status refresh so it is non-mutating and race-safe.
3. Split stale adapter regeneration from `force` overwrites.
4. Rewrite OMP mocks/tests to match real OMP API and cover successful lifecycle commands.
5. Update Specwright verification artifacts after real manual OMP checks.