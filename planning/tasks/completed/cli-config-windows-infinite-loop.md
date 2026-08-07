# CLI hangs on every command (Windows) — `findConfigFile` infinite loop

**Topic:** cli · **Status:** DONE · **Fixed:** 2026-08-04

## Symptom

Every `dms` CLI command hangs indefinitely on Windows (`page list`, `page show`,
`pattern show/dump`, `raw get/create/update`, `section …`) — the process sits idle
(near-zero user CPU) and never makes its request. `mint-token.mjs` is unaffected.
Easy to misattribute to the network/VPN or to remote server slowness; it is neither.

## Root cause

`src/config.js` `findConfigFile()` walks up from the cwd looking for `.dmsrc`:

```js
let dir = startDir;
while (dir !== '/') {
  const configPath = join(dir, '.dmsrc');
  if (existsSync(configPath)) return configPath;
  dir = dirname(dir);
}
```

On POSIX the walk ends at `/` (`dirname('/') === '/'`). On **Windows** the walk reaches
a drive root and `dirname('C:\\') === 'C:\\'` — which is never `'/'`, so the loop never
terminates. Every command calls `resolveConfig()` → `findConfigFile()` before it does
anything, so the whole CLI hangs. `mint-token.mjs` skips `resolveConfig`, which is why it
worked and made the failure look network-related.

## Fix

Terminate when `dirname(dir)` reaches a fixed point (covers both POSIX `/` and Windows
drive roots):

```js
let dir = startDir;
while (true) {
  const configPath = join(dir, '.dmsrc');
  if (existsSync(configPath)) return configPath;
  const parent = dirname(dir);
  if (parent === dir) break;   // FS root: POSIX '/', Windows 'C:\'
  dir = parent;
}
return null;
```

File changed: `packages/dms/cli/src/config.js`.

## Verification

- Reproduced: a standalone loop from `C:\Code\dms-template` reaches the fixed point
  `C:\` after 3 iterations and (with the old guard) would spin forever.
- After the fix, `dms raw get 1077 --attrs id,type` returns in ~1.7s (was ∞);
  `dms page list --pattern 1076` and `dms page show 1077` both return promptly.
- POSIX behaviour unchanged (`dirname('/') === '/'` still breaks the loop).

## Follow-ups (not done here)

- `.dmsrc` discovery is otherwise untested on Windows; no `.dmsrc` was present in this
  tree, so only the walk-termination path was exercised.
