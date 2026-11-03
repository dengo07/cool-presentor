import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

// ---------------------------------------------------------------------------
// Runs the locally installed Claude Code CLI in print mode, so AI features
// work with the user's existing Claude Code login – no API key needed.
//
// It runs locked down: no tools, no MCP servers, no settings/hooks, no saved
// session, in an empty working directory. It can only return text.
// ---------------------------------------------------------------------------

export interface ClaudeCodeInfo {
  found: boolean
  path?: string
  version?: string
}

const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'

function candidates(): string[] {
  const home = homedir()
  const fromPath = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean).map((d) => join(d, exe))
  // Desktop launches often have a minimal PATH – check the usual install spots too.
  const common =
    process.platform === 'win32'
      ? [join(home, '.local', 'bin', exe), join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd')]
      : [
          join(home, '.local', 'bin', exe),
          join(home, '.claude', 'local', exe),
          join(home, '.npm-global', 'bin', exe),
          '/usr/local/bin/claude',
          '/opt/homebrew/bin/claude',
          '/usr/bin/claude'
        ]
  return [...fromPath, ...common]
}

function version(path: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(path, ['--version'], { timeout: 15000, shell: path.endsWith('.cmd') }, (err, stdout) =>
      resolve(err ? undefined : stdout.trim().split('\n')[0])
    )
  })
}

/** Finds the CLI (an explicit path wins) and reports its version. */
export async function detectClaudeCode(explicitPath?: string): Promise<ClaudeCodeInfo> {
  const list = explicitPath ? [explicitPath] : candidates()
  for (const p of list) {
    if (!existsSync(p)) continue
    const v = await version(p)
    if (v) return { found: true, path: p, version: v }
  }
  return { found: false }
}

export class ClaudeCodeError extends Error {}

export interface RunOptions {
  path: string
  prompt: string
  system: string
  schema: Record<string, unknown>
  effort?: 'low' | 'medium' | 'high'
  model?: string
  workdir: string
  timeoutMs?: number
}

/** Runs one structured-output request and returns the parsed object. */
export function runClaudeCode(o: RunOptions): Promise<unknown> {
  mkdirSync(o.workdir, { recursive: true })
  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(o.schema),
    '--system-prompt',
    o.system,
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--strict-mcp-config'
  ]
  if (o.effort) args.push('--effort', o.effort)
  if (o.model) args.push('--model', o.model)

  return new Promise((resolve, reject) => {
    const child = spawn(o.path, args, {
      cwd: o.workdir,
      env: process.env,
      shell: o.path.endsWith('.cmd'),
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new ClaudeCodeError('Claude Code took too long to answer. Try again or ask for fewer slides.'))
    }, o.timeoutMs ?? 10 * 60_000)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new ClaudeCodeError(`Could not start Claude Code: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      let out: Record<string, unknown> | undefined
      try {
        out = JSON.parse(stdout.trim().split('\n').pop() ?? '')
      } catch {
        /* handled below */
      }
      if (out && !out['is_error'] && out['structured_output'] !== undefined) return resolve(out['structured_output'])
      const msg = String(out?.['result'] ?? (stderr || stdout)).trim()
      if (/log ?in|not logged|authenticat|\/login/i.test(msg))
        return reject(new ClaudeCodeError('Claude Code is not logged in. Open a terminal, run `claude` and log in, then try again.'))
      if (out?.['stop_reason'] === 'refusal') return reject(new ClaudeCodeError('Claude declined this request. Try rephrasing it.'))
      reject(new ClaudeCodeError(`Claude Code failed${code ? ` (exit ${code})` : ''}: ${msg.slice(0, 300) || 'no output'}`))
    })
    child.stdin.end(o.prompt)
  })
}
