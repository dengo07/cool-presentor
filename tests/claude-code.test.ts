import { afterAll, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeCodeError, detectClaudeCode, runClaudeCode } from '../src/main/claude-code'

// A fake `claude` CLI: records its args/stdin and answers like `claude -p --output-format json`.
const dir = mkdtempSync(join(tmpdir(), 'cp-claude-'))
const fake = (name: string, body: string): string => {
  const p = join(dir, name)
  writeFileSync(p, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}
const ok = fake(
  'claude-ok',
  `printf '%s\\n' "$@" > "${dir}/args.txt"; cat > "${dir}/stdin.txt"; echo '{"type":"result","subtype":"success","is_error":false,"result":"{}","structured_output":{"text":"Hello"}}'`
)
const loggedOut = fake('claude-logout', `cat > /dev/null; echo '{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}'; exit 1`)
const garbage = fake('claude-bad', `cat > /dev/null; echo 'boom' >&2; exit 2`)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const base = { prompt: 'Rewrite: hi', system: 'SYS', schema: { type: 'object' }, workdir: join(dir, 'work') }

describe.skipIf(process.platform === 'win32')('Claude Code engine', () => {
  it('detects an explicit path and reads its version', async () => {
    expect(await detectClaudeCode(ok)).toEqual({ found: true, path: ok, version: '9.9.9 (Claude Code)' })
    expect((await detectClaudeCode(join(dir, 'missing'))).found).toBe(false)
  })

  it('runs locked down, sends the prompt on stdin and returns structured output', async () => {
    const out = await runClaudeCode({ ...base, path: ok, effort: 'low', model: 'sonnet' })
    expect(out).toEqual({ text: 'Hello' })
    const args = readFileSync(join(dir, 'args.txt'), 'utf8').split('\n')
    expect(args).toContain('-p')
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', ''])
    for (const flag of ['--no-session-persistence', '--strict-mcp-config', '--setting-sources', '--json-schema', '--system-prompt']) expect(args).toContain(flag)
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
    expect(args[args.indexOf('--effort') + 1]).toBe('low')
    expect(readFileSync(join(dir, 'stdin.txt'), 'utf8')).toBe('Rewrite: hi')
  })

  it('turns a logged-out CLI into a friendly message', async () => {
    await expect(runClaudeCode({ ...base, path: loggedOut })).rejects.toThrow(/not logged in/i)
  })

  it('reports crashes with exit code and stderr', async () => {
    const err: Error = await runClaudeCode({ ...base, path: garbage }).catch((e: Error) => e) as Error
    expect(err).toBeInstanceOf(ClaudeCodeError)
    expect(err.message).toMatch(/exit 2.*boom/)
  })
})
