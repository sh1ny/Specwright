# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

Finding matrix:

| Review finding | Frozen ref disposition | Current branch disposition |
|---|---|---|
| OMP `registerTool` obsolete API | Review says broken in `main...refactor/0011-*`; current source evidence contradicts that for the branch content now under review. | Already object-form in `src/runtime/omp/extension.ts:58-64,73-79,108-114`; no runtime fix needed, but tests should keep this contract. |
| Lifecycle blocker stale event shape | Same as above: review finding does not match current code. | Already uses `toolCall.toolName` and `toolCall.input?.agent` in `src/runtime/omp/extension.ts:125-136`. |
| Passive status refresh mutates verification | Valid. | Still present: `src/runtime/omp/status.ts:122` calls `verify --json`. |
| Status refresh race before in-flight guard | Valid. | Still present: guard checked at `status.ts:71-73`, but the shared promise is stored only at `status.ts:164` after async work. |
| Stale adapter marker overwrites user-owned files | Valid. | Still present: init/config pass `needsRegen` as force (`commands.ts:441-443`, `1058-1060`); install writes static/rule files with `input.force` and agents with `input.force || shouldRegenerate` (`install.ts:150-172`). |
| Failed lifecycle command leaves blocker armed | Valid. | Still present: `pendingRoute` is set before `runSpecwrightCommand` at `extension.ts:31-36`. |
| Test mocks obsolete OMP API | Mostly stale. | Tests now use object-form registration and execute in `test/omp-extension.test.ts:484-567`; keep/extend rather than rewrite wholesale. |
| Lifecycle routing tests pass after failed commands | Valid. | Still present: tests call `research 0001` / `plan 0001` in empty temp dirs at `test/omp-extension.test.ts:689-721`. |
| Checkpoint forwarding test weak | Valid. | Still present: test only excludes validation errors in a non-git temp dir at `test/omp-extension.test.ts:641-667`. |
| 0011 verify claims unevidenced manual OMP checks | Valid scope item. | Needs correction or real evidence in `.specwright/changes/0011-*/verify.md` per intent. |
| State title raw markdown | Valid. | Still present in `.specwright/state.json:449-452`. |

## External findings

OMP API docs/source confirm the current extension API shape: `pi.registerTool({ name, label, description, parameters, execute })`, tool-call events expose `toolName`, and blockers return `{ block: true, reason }`. That makes the review's first two HIGH runtime API findings stale for the current branch, while the passive mutation/race/overwrite findings remain source-supported.

## Implications

Plan should not blindly apply the whole review. It should split accepted findings into targeted fixes: non-mutating/race-safe status refresh, safe adapter regeneration, lifecycle route arming after successful prompt emission, stronger tests, 0011 verification artifact correction, and state title cleanup. Preserve the already-correct OMP object-form tool API.

