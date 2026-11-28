import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hookScript = join(pluginRoot, 'scripts', 'session_start.mjs')
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
const configPath = join(codexHome, 'hooks.json')
const command = `node "${hookScript}"`
let config = { hooks: {} }

try {
  config = JSON.parse(await readFile(configPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

config.hooks ??= {}
config.hooks.SessionStart ??= []
const alreadyInstalled = config.hooks.SessionStart.some(group =>
  group.hooks?.some(hook => hook.command === command),
)

if (!alreadyInstalled) {
  config.hooks.SessionStart.push({
    matcher: 'startup|resume|clear|compact|fork',
    hooks: [{
      type: 'command',
      command,
      statusMessage: '加载直白文风约束',
      timeout: 5,
      additionalContextLimit: 1500,
    }],
  })
}

await mkdir(codexHome, { recursive: true })
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${alreadyInstalled ? '已存在' : '已注册'}：${configPath}\n`)
