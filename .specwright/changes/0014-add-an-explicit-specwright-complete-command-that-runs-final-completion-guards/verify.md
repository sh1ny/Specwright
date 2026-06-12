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
