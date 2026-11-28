import { lookup, PARTS } from '../rules.js'

const part = process.argv[2] ?? 'all'
const markdown = lookup(part)
if (markdown === null) {
  process.stderr.write(`可用部分：${PARTS.join(' / ')}\n`)
  process.exit(2)
}
process.stdout.write(`${markdown}\n`)
