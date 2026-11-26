/**
 * Rule engine behind the humanize_check tool.
 *
 * The table is a set of leads, not a blacklist: every hit is reported with the
 * matched excerpt so the caller can decide from context whether it carries
 * independent information. Statistics (dash count, bold ratio, sentence
 * length, paragraph uniformity) are reported next to the pattern hits because
 * they are the tells a word list can never catch.
 */

const SEVERITY = { high: 3, mid: 2, low: 1 }

/** @typedef {{ id: string, group: string, re: RegExp, advice: string, sev: 'high'|'mid'|'low' }} Rule */

/** @type {Rule[]} */
const CN_RULES = [
  // 铺垫与否定
  { id: 'cn-not-x-but-y', group: '平行否定', sev: 'high', re: /不是[^，。！？\n]{1,30}[，,]\s*(而|反而)?是/g, advice: '直接说正面断言，删掉否定铺垫' },
  { id: 'cn-neither', group: '平行否定', sev: 'high', re: /不能(认为|当作|说)[^。\n]{0,40}(也不能|也不能当作|也不应)/g, advice: '给出一个确定判断，不要双向免责' },
  { id: 'cn-not-need-either', group: '平行否定', sev: 'high', re: /不需要[^。\n]{0,25}(也不需要|也无须|也无需)/g, advice: '说明实际需要什么' },
  { id: 'cn-rather-than', group: '平行否定', sev: 'high', re: /与其说[^。\n]{0,30}(不如|毋宁)说/g, advice: '直接说结论' },
  { id: 'cn-not-only', group: '平行否定', sev: 'mid', re: /不仅[^。\n]{0,30}(更是|更|而且|还)[^。\n]{0,20}/g, advice: '拆成两句，或只留信息量大的那一半' },
  { id: 'cn-from-to', group: '平行否定', sev: 'mid', re: /从[^。\n]{1,15}?到[^。\n]{1,15}?再到/g, advice: '三段递进是模板，只留有信息的那一段' },

  // 元话语
  { id: 'cn-meta-judgement', group: '元话语', sev: 'high', re: /我想(提出|说|强调)一个?[^。\n]{0,10}/g, advice: '删掉引导语，直接写判断' },
  { id: 'cn-meta-advise', group: '元话语', sev: 'mid', re: /我(建议|想|打算|认为应该)|我不(想|打算|建议)/g, advice: '改成动作句，例如「先排查网络延迟」' },
  { id: 'cn-meta-plain', group: '元话语', sev: 'mid', re: /说白了|本质上(就)?是|说到底|归根结底/g, advice: '这是铺垫，删掉直接说事' },
  { id: 'cn-meta-realize', group: '元话语', sev: 'mid', re: /我们(需要|必须)(认识到|意识到|明确)/g, advice: '直接陈述事实或动作' },
  { id: 'cn-meta-look', group: '元话语', sev: 'mid', re: /让我们(来)?(一起)?(看看|深入|探讨|了解)|接下来我们(来看|讨论)/g, advice: '删掉预告，直接给内容' },

  // 伪严谨
  { id: 'cn-note-worth', group: '伪严谨', sev: 'high', re: /(值得|需要)注意的?是|值得一提的是|需要指出的是|必须指出的?是/g, advice: '删掉，直接说这件事本身' },
  { id: 'cn-hedge-maybe', group: '伪严谨', sev: 'high', re: /或许未必|也许未必|(还|尚)不能(得出)?结论|有待进一步(观察|验证)[^。\n]{0,10}/g, advice: '缺数据就点明缺哪个指标或哪次测试' },
  { id: 'cn-hedge-degree', group: '伪严谨', sev: 'mid', re: /在某种程度上|一定程度上|客观(地)?(讲|说)|平心而论|相对而言(?=，)/g, advice: '给出校准过的判断，删掉程度状语' },
  { id: 'cn-hedge-dialectic', group: '伪严谨', sev: 'mid', re: /既要[^。\n]{0,20}又要|既[^。\n]{0,12}又(要|想|能|得)/g, advice: '如果有一方更重，直接说哪一方' },
  { id: 'cn-hedge-dialectic-b', group: '伪严谨', sev: 'mid', re: /一方面[^。\n]{0,30}另一方面/g, advice: '如果有一方更重，直接说哪一方' },

  // 套话与收尾
  { id: 'cn-conclusion', group: '套话收尾', sev: 'high', re: /综上所述|总而言之|总的来说|由此可见|一言以蔽之|综上，/g, advice: '删掉收尾句，正文写完就停' },
  { id: 'cn-service-close', group: '套话收尾', sev: 'high', re: /希望(这|以上)?(对你|对您)?(能|可以)?(有所)?(帮助|帮到你)|如(需|有)(进一步|更多|其他)|欢迎随时(交流|联系|提问)|(还|你|您)有其他问题|如果你还有(其他)?问题/g, advice: '客服腔，删掉' },
  { id: 'cn-great-question', group: '套话收尾', sev: 'high', re: /(这是一个|这是个)(很好|非常好|不错)的?问题|好问题|感谢(您的?)?(提问|阅读|关注)/g, advice: '删掉开场客套，第一句给答案' },
  { id: 'cn-era-open', group: '套话收尾', sev: 'high', re: /随着[^。\n]{0,20}的(不断)?(发展|进步|普及|推进)|在(当今|当前)?[^。\n]{0,15}(的)?(时代)?背景下|在(这个|当今)[^。\n]{0,10}(时代|社会)|在[^。\n]{0,12}的今天/g, advice: '背景没有独立信息就删掉，直接说事' },

  // 抽象词
  { id: 'cn-jargon', group: '抽象大词', sev: 'mid', re: /赋能|抓手|闭环|生态圈|生态位|生态|护城河|底层逻辑|顶层设计|组合拳|全方位|多维度|全链路|数字化转型|数字化|新质生产力|压舱石|护航|助力|全景|至关重要|举足轻重|深入探讨|无缝|稳健/g, advice: '换成具体做了什么、改了什么数字' },
  { id: 'cn-inflate', group: '拔高', sev: 'high', re: /标志着|里程碑|具有(深远|重大)(的)?(影响|意义)|开启(了)?新(的)?(篇章|时代|阶段)|书写(了)?新/g, advice: '删掉意义拔高，只留发生了什么' },
  { id: 'cn-avoid-be', group: '拔高', sev: 'mid', re: /(作为|充当|扮演)[^。\n]{0,20}(而存在|的角色|的作用|的载体)|起到了?[^。\n]{0,12}的作用/g, advice: '用「是」「有」直接说' },
  { id: 'cn-tail-inflate', group: '拔高', sev: 'high', re: /[，,][^。\n]{0,30}(充分)?(体现|彰显|凸显|印证|折射)(了)?/g, advice: '删掉句尾赞美，保留真实原因时改写' },
  { id: 'cn-tail-verb', group: '拔高', sev: 'mid', re: /(以|来|用以)?(充分)?(彰显|凸显|印证)(了)?(其|这|该)?/g, advice: '删掉以「彰显/凸显/印证」结尾的拔高尾巴' },
  { id: 'cn-promo', group: '拔高', sev: 'mid', re: /堪称|不失为|完美(诠释|结合|呈现)|令人(眼前一亮|印象深刻)|独具匠心/g, advice: '主观评价保留为评价，不加宣传语' },
  { id: 'cn-attrib', group: '借权威', sev: 'high', re: /专家(指出|表示|认为)|业界(普遍)?认为|多项研究(表明|显示)|有(分析|观察)(认为|指出)|据了解|据悉/g, advice: '实名来源保留；笼统归因保留其不确定性' },
  { id: 'cn-media-boost', group: '借权威', sev: 'mid', re: /据(多家)?媒体(报道|披露)|多家媒体(报道|指出)|在社交媒体(上)?(相当|非常|十分)?活跃|具有(一定的?)?(能见度|影响力)/g, advice: '罗列报道证明不了什么，直接说事实' },

  // 空泛正面（均值回归：笼统夸奖，省掉具体细节）
  { id: 'cn-vague-praise', group: '拔高', sev: 'mid', re: /享有(一定的?)?(知名度|声誉|美誉)|广受(好评|欢迎|喜爱|赞誉|关注)|备受(赞誉|推崇|关注|瞩目|好评)|深受(喜爱|欢迎|信赖)|赢得(了)?(一定的?)?(声誉|好评|认可|口碑)|引起(了)?(广泛|强烈|热烈)(关注|反响)/g, advice: '换成具体做了什么、谁在什么场合说了什么' },

  // 结局式展望
  { id: 'cn-outlook', group: '套话收尾', sev: 'mid', re: /未来可期|前景(广阔|可期|看好|十分)|拭目以待|值得期待|大有可为|值得关注/g, advice: '删掉展望句，正文写完就停' },

  // 对话式开场（「说到 X，很多人会想到」）
  { id: 'cn-convo-open', group: '元话语', sev: 'mid', re: /说到[^。\n，,]{1,15}[，,][^。\n]{0,8}(不得不|绝对|就)|提到[^。\n，,]{1,15}[，,](很多人|大家|不少人|人们)|谈到[^。\n，,]{1,15}[，,](很多人|大家)/g, advice: '删掉寒暄式引入，第一句给事实' },

  // 知识截止免责与笼统保证
  { id: 'cn-cutoff', group: '伪严谨', sev: 'mid', re: /(截至|截止)[^。\n]{0,6}知识|知识(截止|截至)|建议(您|你)(查阅|参考|查看)(最新|相关|官方)|请以(官方|官网)[^。\n]{0,6}为准|我(无法|不能)提供[^。\n]{0,10}(信息|内容|最新)/g, advice: '查不到就说缺哪个来源，不要写免责声明' },
  { id: 'cn-vague-assurance', group: '元话语', sev: 'mid', re: /确保(内容|信息|表述)(符合|满足)|在保留原意的?同时|(提升|改善)(了)?(可读性|准确性|中立性|一致性)|优化(了)?(结构|表达|排版)/g, advice: '说清改了哪一句、哪个事实，不要笼统保证质量' },

  // 谄媚式附和
  { id: 'cn-sycophancy', group: '套话收尾', sev: 'high', re: /你说得(对|没错|很对)|说得(很)?有道理|您的?(观察|理解|判断|思路)(很|非常)?(准确|到位|深刻)|这(是)?(一个)?(很好|不错)的?(观察|角度|切入点)/g, advice: '别先肯定再拐弯，直接说哪部分对、哪部分错' },

  // 中文冗余
  { id: 'cn-do-verb', group: '中文冗余', sev: 'low', re: /进行(了)?(全面|深入|系统|重点|进一步)?(的)?(测试|调整|优化|分析|评估|检查|改造|升级|处理)/g, advice: '直接用动词：测试、调整、优化' },
  { id: 'cn-de-stack', group: '中文冗余', sev: 'low', re: /的[^的，。\n]{1,8}的[^的，。\n]{1,8}的/g, advice: '拆句，减少长定语' },
  { id: 'cn-passive-stack', group: '中文冗余', sev: 'low', re: /被[^。\n]{0,12}被/g, advice: '施事者已知就改主动句' },
]

/** @type {Rule[]} */
const EN_RULES = [
  { id: 'en-not-just', group: 'English', sev: 'high', re: /\bnot (just|only) [^.,;!?\n]{1,40}?,? but( also)?\b/gi, advice: 'state the plain claim' },
  { id: 'en-worth-noting', group: 'English', sev: 'high', re: /\b(it'?s|it is) worth noting\b|\bnotably,|\bimportantly,/gi, advice: 'delete the lead-in' },
  { id: 'en-conclusion', group: 'English', sev: 'high', re: /\bin conclusion\b|\boverall,|\bultimately,|\bto sum up\b/gi, advice: 'stop after the last point' },
  { id: 'en-avoid-be', group: 'English', sev: 'mid', re: /\bserves? as\b|\bstands? as\b|\bplay(s|ed)? a (crucial|pivotal|vital|significant|key|major|central) role\b/gi, advice: 'use "is" or "has"' },
  { id: 'en-inflate', group: 'English', sev: 'high', re: /\bis a testament to\b|\bunderscores? the (importance|significance)\b|\breflects? (a )?broader\b|\bmarking a turning point\b|\bevolving landscape\b|\bindelible mark\b|\bsetting the stage\b/gi, advice: 'delete the significance clause' },
  { id: 'en-ai-words', group: 'English', sev: 'mid', re: /\b(delve|tapestry|testament|pivotal|realm|underscore|showcase|foster|leverage|seamless|robust|holistic|multifaceted|intricate|embark)\b/gi, advice: 'plain word, unless it is a real term of art' },
  { id: 'en-service', group: 'English', sev: 'high', re: /\bi hope this helps\b|\blet me know if\b|\bwould you like me to\b|\bgreat question\b|\bfeel free to\b/gi, advice: 'delete the service-desk line' },
  { id: 'en-vague-attrib', group: 'English', sev: 'high', re: /\bexperts say\b|\bobservers have noted\b|\bstudies (suggest|show)\b|\bindustry reports\b/gi, advice: 'name the source or keep it explicitly vague' },
  { id: 'en-era', group: 'English', sev: 'mid', re: /\bin today'?s\b|\bever-evolving\b|\blet'?s (dive|unpack|explore)\b|\bdive into\b/gi, advice: 'delete the framing, start with the fact' },
]

const ALL_RULES = [...CN_RULES, ...EN_RULES]

/** 1-based line and column for a string index. */
function lineCol(text, index) {
  const before = text.slice(0, index)
  const line = before.split('\n').length
  return { line, col: index - before.lastIndexOf('\n') }
}

/** Short human-readable window around a match. */
function excerpt(text, index, length) {
  const start = Math.max(0, index - 16)
  const end = Math.min(text.length, index + length + 16)
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
}

/** Count occurrences of a plain pattern. */
function count(text, re) {
  const m = text.match(re)
  return m ? m.length : 0
}

/** Statistical tells that no word list catches. */
function stats(text) {
  const chars = text.length
  const paragraphs = text.split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean)
  const sentences = text.split(/[。！？!?；;]+|\n{2,}/).map(s => s.trim()).filter(s => s.length > 1)
  const emDash = count(text, /——/g) + count(text, /—(?!—)/g) + count(text, /(^|[^-])--(?=[^-])/g)
  const boldMatches = [...text.matchAll(/\*\*([^*\n]+)\*\*/g)].map(m => m[1])
  const boldChars = boldMatches.reduce((sum, s) => sum + s.length, 0)
  const lines = text.split('\n')
  const bulletLines = lines.filter(l => /^\s*([-*+]\s+|\d+[.、)]\s+)/.test(l)).length
  const nonEmptyLines = lines.filter(l => l.trim()).length || 1
  const emojiHeading = lines.filter(l => /^#{1,6}\s*[\p{Extended_Pictographic}]/u.test(l)).length
  const emojiAny = count(text, /[\p{Extended_Pictographic}]/gu)
  const tableRows = lines.filter(l => l.trim().startsWith('|')).length
  const parenthetical = count(text, /（[^）]{0,20}(也就是|即|即所谓)[^）]{0,20}）/g)

  let uniformity = null
  if (paragraphs.length >= 3) {
    const lens = paragraphs.map(p => p.length)
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length
    const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length
    uniformity = mean > 0 ? Math.sqrt(variance) / mean : 0
  }

  return {
    chars,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    avgSentenceChars: sentences.length ? Math.round(chars / sentences.length) : 0,
    emDash,
    emDashPer1000: chars ? Math.round((emDash / chars) * 1000 * 10) / 10 : 0,
    boldCount: boldMatches.length,
    boldRatio: chars ? Math.round((boldChars / chars) * 1000) / 10 : 0,
    bulletRatio: Math.round((bulletLines / nonEmptyLines) * 100),
    emojiHeadings: emojiHeading,
    emoji: emojiAny,
    tableRows,
    parenthetical,
    paragraphUniformity: uniformity === null ? null : Math.round(uniformity * 100) / 100,
  }
}

/** Structural checks that need more than one pattern. */
function structuralNotes(text, s) {
  const notes = []
  if (s.emDashPer1000 >= 2) notes.push(`破折号密度偏高：${s.emDash} 处 / ${s.chars} 字，当作逗号用了。`)
  if (s.boldRatio > 5) notes.push(`加粗占比 ${s.boldRatio}%，超过 5% 的上限。`)
  if (s.bulletRatio > 60 && s.chars > 400) notes.push(`列表行占比 ${s.bulletRatio}%，正文被拆成了要点提纲。`)
  if (s.paragraphUniformity !== null && s.paragraphUniformity < 0.15) notes.push(`段落长度高度均匀（变异系数 ${s.paragraphUniformity}），读起来像模板。`)
  if (s.emojiHeadings > 0) notes.push(`${s.emojiHeadings} 个标题带 emoji 装饰。`)
  if (s.tableRows >= 4 && s.chars < 600) notes.push('短文本配了表格，两个选项也做成了多列表格。')
  if (s.parenthetical >= 3) notes.push(`${s.parenthetical} 处「（也就是……）」式括号解释。`)

  const threeStep = /首先[^。\n]{0,40}/.test(text) && /其次[^。\n]{0,40}/.test(text) && /(最后|再次)[^。\n]{0,40}/.test(text)
  if (threeStep) notes.push('出现「首先/其次/最后」骨架，没有真实顺序就拆掉。')

  return notes
}

/**
 * Scan text for style defects.
 * @param {string} text
 * @param {{ lang?: 'zh'|'en'|'auto', limit?: number }} [options]
 */
export function analyze(text, options = {}) {
  const source = String(text ?? '')
  const lang = options.lang ?? 'auto'
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200)

  if (!source.trim()) {
    return { ok: false, error: 'text 为空，没有可扫描的内容。' }
  }

  const s = stats(source)
  const hits = []

  for (const rule of ALL_RULES) {
    if (lang === 'zh' && rule.group === 'English') continue
    if (lang === 'en' && rule.group !== 'English') continue
    let seen = 0
    for (const m of source.matchAll(rule.re)) {
      if (seen >= 5) break
      const { line, col } = lineCol(source, m.index ?? 0)
      hits.push({
        group: rule.group,
        severity: rule.sev,
        match: m[0].slice(0, 40),
        line,
        col,
        excerpt: excerpt(source, m.index ?? 0, m[0].length),
        advice: rule.advice,
      })
      seen += 1
    }
  }

  hits.sort((a, b) => a.line - b.line || a.col - b.col)

  const groups = {}
  let score = 0
  for (const hit of hits) {
    groups[hit.group] = (groups[hit.group] ?? 0) + 1
    score += SEVERITY[hit.severity]
  }

  const density = s.chars >= 300 ? score / (s.chars / 300) : score
  const verdict = density >= 9 ? 'heavily templated' : density >= 4 ? 'some templating' : density > 0 ? 'mostly clean' : 'clean'

  const notes = structuralNotes(source, s)

  return {
    ok: true,
    lang,
    chars: s.chars,
    stats: s,
    verdict,
    score: Math.round(density * 10) / 10,
    hitCount: hits.length,
    groups,
    hits: hits.slice(0, limit),
    truncated: hits.length > limit,
    notes,
  }
}
