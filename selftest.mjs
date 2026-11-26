/**
 * Dev self-test: verifies the pattern engine and the rule lookup without a
 * host. Run with `node selftest.mjs`.
 */

import { analyze } from './analyze.js'
import { lookup, PARTS } from './rules.js'

const polluted = `值得注意的是，这是一个很好的问题。随着人工智能技术的不断发展，我们的产品全方位赋能业务。

首先，我们进行了全面的测试。其次，我们进行了系统的优化。最后，我们得出结论。

这不仅是一个导出按钮，更是通往高效工作的全新入口。该方案稳定可靠、快速响应、易于维护。
不是不能认为机房建多了就是算力过剩，也不能当作芯片没市场。

综上所述，希望这对你有帮助！如果需要进一步了解，欢迎随时交流。`

const clean = `机房空置是因为地方盲目采购了低端卡，高端训练芯片依然缺货。先排查网络延迟，再看队列有没有确认机制。`

const report = analyze(polluted, { limit: 200 })
console.log('--- polluted ---')
console.log('verdict:', report.verdict, 'score:', report.score, 'hits:', report.hitCount)
console.log('groups:', JSON.stringify(report.groups, null, 0))
console.log('notes:', report.notes)
console.log('first hit:', JSON.stringify(report.hits[0], null, 0))

const cleanReport = analyze(clean)
console.log('\n--- clean ---')
console.log('verdict:', cleanReport.verdict, 'hits:', cleanReport.hitCount, 'notes:', cleanReport.notes)

const en = analyze('It is worth noting that this serves as a pivotal step. Let me know if you have questions.')
console.log('\n--- english ---')
console.log('groups:', JSON.stringify(en.groups))

console.log('\n--- rules ---')
for (const part of PARTS) {
  const md = lookup(part)
  console.log(part.padEnd(12), md ? `${md.length} chars` : 'MISSING')
}

const problems = []
if (report.verdict === 'clean') problems.push('polluted sample judged clean')
if (!report.groups['套话收尾']) problems.push('no 套话收尾 group')
if (!report.groups['平行否定']) problems.push('no 平行否定 group')
if (cleanReport.hitCount > 2) problems.push('clean sample over-flagged')
if (!en.groups['English']) problems.push('english rules did not fire')
for (const part of PARTS) if (!lookup(part)) problems.push(`missing rules part ${part}`)

console.log('\nproblems:', problems.length === 0 ? 'none' : problems)
process.exitCode = problems.length === 0 ? 0 : 1
