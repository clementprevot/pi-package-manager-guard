# @clementprevot/pi-package-manager-guard

A [Pi](https://pi.dev) extension that keeps the coding agent honest about package managers: when the agent runs a Node package manager command that does not match the manager your repo's lockfile declares, the command is paused and you decide.

## Why

Agents mix up package managers constantly. In a Yarn repo they reach for `npm install`, in a pnpm repo they run `bun add`, and suddenly your lockfile has two managers in it and CI is red. This guard catches the mismatch before the command runs.

## Install

```bash
pi install npm:@clementprevot/pi-package-manager-guard
```

Updates ship with `pi update --extensions`. The extension applies to your next session (quit and relaunch or issue a `/reload` command).

## How it works

On every bash tool call, the extension:

1. Walks up from the session's working directory to find the nearest lockfile (`yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `bun.lock`, `package-lock.json`). It stops at the git root, so a stray lockfile in an enclosing folder does not leak in.
2. Splits the command chain into subcommands (respecting quotes, so `echo "use npm here"` never trips the gate) and checks each one's package manager.
3. Asks you what to do on a mismatch:

```
This repo uses yarn (lockfile) but the command uses npm. Allow?
> Yes, allow once
  Yes, allow for this session
  No, use yarn instead
  No, with a reason
  Stop
```

"No, with a reason" sends your free-text reason back to the agent, which is usually enough for it to correct itself without another round trip.

### Exemptions

Commands that never touch the repo's dependencies are allowed through:

- `npx` and `bunx` (runners)
- `yarn dlx` and `pnpm dlx`
- `npm exec`
- Any command that is not a Node package manager (`git`, `brew`, ...)
- Environment-variable prefixes are stripped first, so `CI=1 npm install` still gets gated

Outside a repo with a lockfile, the guard does nothing.

## Configuration

None. The lockfile is the source of truth, by design.

## Local development

```bash
corepack enable
yarn install
yarn test
yarn typecheck
```

To try the extension in a live session without installing it:

```bash
pi -e /path/to/this/repo
```

## License

[MIT](LICENSE)
