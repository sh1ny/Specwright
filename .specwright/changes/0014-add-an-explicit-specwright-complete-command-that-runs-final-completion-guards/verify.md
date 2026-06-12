# Verification

## Result

PASS

## Issues

No issues.

## Observed output

```
$ bun test test/core-commands.test.ts -t "complete"
Test Results:
   PASS: 19 passed
```

```
$ bun test test/core-commands.test.ts -t "publish"
Test Results:
   PASS: 5 passed
```

```
$ bun test test/core-commands.test.ts -t "complete|publish"
Test Results:
   PASS: 24 passed
```

```
$ bun test test/core-validators.test.ts
Test Results:
   PASS: 7 passed
```

```
$ bun test test/core-commands.test.ts -t "verify preserves|complete"
Test Results:
   PASS: 20 passed
```

```
$ bun run typecheck
$ tsc --noEmit
```

```
$ specwright_validate(change="0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards")
{
  "ok": true,
  "issues": []
}
```
