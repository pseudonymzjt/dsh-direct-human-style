import { readFile } from 'node:fs/promises'
import { analyze } from '../analyze.js'

const langArg = process.argv.find(arg => arg.startsWith('--lang='))
const lang = langArg?.slice('--lang='.length) ?? 'auto'
if (!['auto', 'zh', 'en'].includes(lang)) {
  process.stderr.write('用法：node scripts/check.mjs [--lang=auto|zh|en] < file.txt\n')
  process.exit(2)
}

const input = await readFile(0, 'utf8')
if (!input.trim()) {
  process.stderr.write('请通过标准输入传入要检查的文本。\n')
  process.exit(2)
}

const result = analyze(input, { lang, limit: 200 })
const lines = [
  `判定：${result.verdict}（词级密度 ${result.wordDensity ?? result.score} · 结构分 ${result.structurePoints ?? 0}）· ${result.chars} 字 · ${result.stats.sentences} 句 · 平均句长 ${result.stats.avgSentenceChars} 字`,
  `命中 ${result.hitCount} 处：${Object.entries(result.groups).map(([group, count]) => `${group} ${count}`).join(' · ') || '无'}`,
]

if (result.notes.length) lines.push('', '结构提示：', ...result.notes.map(note => `- ${note}`))
if (result.caveats.length) lines.push('', '指标限制：', ...result.caveats.map(caveat => `- ${caveat}`))
if (result.hits.length) {
  lines.push('', '命中明细：')
  for (const hit of result.hits) {
    lines.push(`- L${hit.line}:${hit.col} [${hit.group}/${hit.severity}] ${hit.match}`)
    lines.push(`  上下文：${hit.excerpt}`)
    lines.push(`  改法：${hit.advice}`)
  }
}
lines.push('', '命中只是线索。结合语境判断；保留有独立信息的表达。')
process.stdout.write(`${lines.join('\n')}\n`)
