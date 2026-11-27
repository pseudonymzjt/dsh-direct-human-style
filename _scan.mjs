import fs from 'node:fs'
import { analyze } from './analyze.js'

const raw = fs.readFileSync(process.argv[2], 'utf8')
const data = JSON.parse(raw)
const lines = []
function walk(blocks) {
  for (const b of blocks || []) {
    if (b.text) lines.push(b.text)
    if (b.children) walk(b.children)
  }
}
walk(data.page.blocks)
const text = lines.join('\n')
fs.writeFileSync('_page.txt', text, 'utf8')
const r = analyze(text, { lang: 'auto' })
console.log('chars', r.chars, 'sentences/avg', r.stats.avgSentenceChars)
console.log('verdict', r.verdict, 'score', r.score, 'hits', r.hitCount)
console.log('groups', JSON.stringify(r.groups))
console.log('stats', JSON.stringify(r.stats))
console.log('notes', JSON.stringify(r.notes, null, 1))
console.log('--- hits ---')
for (const h of r.hits) console.log(`${h.group}/${h.severity}  ${h.match.slice(0,40)}`)
