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
  { id: 'cn-sycophancy', group: '套话收尾', sev: 'high', re: /你说得(对|没错|很对)(?![^。！？\n]{0,15}(但|不过|然而|可是))|说得(很)?有道理|您的?(观察|理解|判断|思路)(很|非常)?(准确|到位|深刻)|这(是)?(一个)?(很好|不错)的?(观察|角度|切入点)/g, advice: '别先肯定再拐弯，直接说哪部分对、哪部分错' },

  // 先肯定后转折、否定链、同义反复、流程堆砌、故作沉稳（2026-11 语料新增）
  { id: 'cn-affirm-pivot', group: '平行否定', sev: 'high', re: /(你说得(对|没错|有道理|很对)|你的?(观点|说法|理解|判断)(很|非常)?有(价值|道理)|这个(想法|思路|观点)很(好|不错)|我(完全)?同意你的?)[^。！？\n]{0,15}[，,]\s*(但|不过|然而|可是)/g, advice: '不同意的部分直接说，不必先发糖再下刀' },
  { id: 'cn-neg-chain', group: '伪严谨', sev: 'mid', re: /(不代表|不能|无法|不足以|不应|不宜|不可)[^。！？\n\d]{0,20}(不代表|不能|无法|不足以|不应|不宜|不可)/g, advice: '一条判断就够；带具体数值的规格上下限不算' },
  { id: 'cn-restate', group: '元话语', sev: 'mid', re: /换言之|换句话说|也就是说|更准确地说|更准确的说|简言之|用更直白的话说/g, advice: '换个说法重复不算新信息，删掉或补一条新证据' },
  { id: 'cn-purpose-open', group: '元话语', sev: 'mid', re: /为了更好地(帮助|理解|服务|支持)你|为(了)?避免(误解|混淆)|先(明确|澄清|确认)一下(边界|范围|前提)|我(先)?(复述|确认)一下/g, advice: '删掉铺陈直接给内容；不确定就写不确定在哪' },
  { id: 'cn-therapy', group: '套话收尾', sev: 'mid', re: /我理解你的(情绪|感受|担心|顾虑|处境)|我(能)?(感受到|理解)你的[^。\n]{0,4}(情绪|感受)|建议(你)?保持(理性|冷静|耐心)|按(你自己|自己)?(感到)?舒适的(节奏|方式|步调)|你的(感受|情绪)(很|非常)?(重要|合理)/g, advice: '不必替对方做情绪管理，说清事实就行' },
  { id: 'cn-refuse-redirect', group: '套话收尾', sev: 'low', re: /我(无法|不能)(提供|回答|帮助)[^。！？\n]{0,15}[，,]\s*(但|不过|可以|你可以)/g, advice: '不能做就说不能做，替代方案另起一句' },
  { id: 'cn-wuxia-tone', group: '拔高', sev: 'high', re: /这话我(记下|认)(了|着)?|这话(说)?得(不轻|有点重)|这事我?心里有数|这笔账|我守着|你往下讲|这个问题我?先不接|行，这话/g, advice: '别把日常对话演成电影台词，说「知道了」「好」就够' },
  { id: 'cn-proc-pile', group: '抽象大词', sev: 'mid', re: /(?:[\u4e00-\u9fa5]{2,4}[、，]){4,}/g, advice: '四个以上并列词堆在一起通常没说什么对象；挑真正做的那两三件' },

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
  { id: 'en-affirm-pivot', group: 'English', sev: 'high', re: /\b(you'?re (absolutely |totally )?right|that'?s a (great|good|fair|excellent) (point|question)|fair enough)\b[^.!?\n]{0,25}[,.]?\s*(but|however|that said|yet)\b/gi, advice: 'say the disagreement outright, skip the sugar' },
  { id: 'en-therapy', group: 'English', sev: 'mid', re: /\bI (understand|hear|appreciate) (your|that|how)\b|\bwhatever you'?re comfortable with\b/gi, advice: 'skip the counselling, state the fact' },
  { id: 'en-clarify', group: 'English', sev: 'mid', re: /\b(let me (clarify|be clear)|to be clear|to avoid (any )?confusion|just to clarify)\b/gi, advice: 'delete the lead-in, give the content' },
  { id: 'en-refuse-redirect', group: 'English', sev: 'low', re: /\bI can'?t (help with|answer|provide)\b[^.!?\n]{0,30}[,.]?\s*(but|however)\b/gi, advice: 'refuse plainly; put the alternative in its own sentence' },
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
  let paragraphs = text.split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean)
  // 从 Notion / 网页抽出来的文本常常只有单换行，没有空行分段。
  if (paragraphs.length < 3) {
    const lineParas = text.split('\n').map(p => p.trim()).filter(Boolean)
    if (lineParas.length >= 5) paragraphs = lineParas
  }
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
    markdownFree: boldMatches.length === 0 && bulletLines === 0 && tableRows === 0,
  }
}

/**
 * Structural checks: the shape of the text, which word-level regexes cannot see.
 * Every note carries a fixed weight, so the verdict does not decay with length —
 * a 20,000-character document with a rigid skeleton is not "cleaner" than a
 * 500-character one with the same tells.
 */
function structural(text, s) {
  const notes = []
  const caveats = []
  let points = 0

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const lineCount = lines.length || 1

  // 序数骨架：结论一/结论二/结论三……同一标签连续编号
  const ordinalRe = /(结论|优化|架构|局限|路径|路线|方案|策略|原因|要点|阶段|做法|假设|边界|层次|方向|风险|收益|成本|步骤|环节)[一二三四五六七八九十]/g
  const byLabel = new Map()
  for (const m of text.matchAll(ordinalRe)) byLabel.set(m[1], (byLabel.get(m[1]) ?? 0) + 1)
  const runs = [...byLabel.entries()].filter(([, n]) => n >= 3)
  if (runs.length) {
    const total = runs.reduce((sum, [, n]) => sum + n, 0)
    const shape = runs
      .map(([label, n]) => `${label}一~${label}${'一二三四五六七八九十'[Math.min(n, 10) - 1]} ${n} 条`)
      .join('、')
    points += runs.length >= 2 ? 4 : 3
    notes.push(`序数骨架 ${runs.length} 组共 ${total} 条：${shape}。整节按编号平铺，读者看不出轻重，改成按重要性排或直接写散文。`)
  }

  // 标签冒号开头：每条都以「短语：」起头
  const labelOpeners = lines.filter(l => /^[^。！？，、：\n]{2,12}：/.test(l)).length
  const labelRatio = Math.round((labelOpeners / lineCount) * 100)
  if (labelOpeners >= 8 && labelRatio >= 8) {
    points += labelRatio >= 20 ? 4 : 3
    notes.push(`「标签：内容」开头 ${labelOpeners} 条，占全部段落的 ${labelRatio}%。条目全做成表单字段，是把散文写成了配置项。`)
  }

  // 短句先行再展开：每条都是「一句话结论。补充说明」的同一节奏
  const leadThenBody = lines.filter(l => /^[^\n]{6,40}。\s*\S/.test(l)).length
  if (leadThenBody >= 6) {
    points += leadThenBody >= 12 ? 2 : 1
    notes.push(`短句先行再展开 ${leadThenBody} 处，每条都是同一节奏，读下去像模板填空。`)
  }

  // 对称否定总量，正序「不是…是…」与反序「…，不是…」都算
  const notXButY = (text.match(/不是[^。！？\n]{2,25}[，,]\s*(而是|是)[^。！？\n]{2,25}/g) ?? []).length
  const yNotX = (text.match(/[^。！？\n]{2,25}[，,]\s*不是[^。！？\n]{2,25}[。！？]/g) ?? []).length
  const negTotal = notXButY + yNotX
  if (negTotal >= 10) {
    points += negTotal >= 18 ? 3 : 2
    notes.push(`对称否定 ${negTotal} 处（「不是…是…」${notXButY}，「…，不是…」${yNotX}）。对比立得住就直说结论，不必每段先摆一个错的再纠正。`)
  }

  if (s.emDashPer1000 >= 2) {
    points += 1
    notes.push(`破折号密度偏高：${s.emDash} 处 / ${s.chars} 字，当作逗号用了。`)
  }
  if (s.boldRatio > 5) {
    points += 1
    notes.push(`加粗占比 ${s.boldRatio}%，超过 5% 的上限。`)
  }
  if (s.bulletRatio > 60 && s.chars > 400) {
    points += 1
    notes.push(`列表行占比 ${s.bulletRatio}%，正文被拆成了要点提纲。`)
  }
  if (s.paragraphUniformity !== null && s.paragraphUniformity < 0.15) {
    points += 1
    notes.push(`段落长度高度均匀（变异系数 ${s.paragraphUniformity}），读起来像模板。`)
  }
  if (s.emojiHeadings > 0) {
    points += 1
    notes.push(`${s.emojiHeadings} 个标题带 emoji 装饰。`)
  }
  if (s.tableRows >= 4 && s.chars < 600) {
    points += 1
    notes.push('短文本配了表格，两个选项也做成了多列表格。')
  }
  if (s.parenthetical >= 3) {
    points += 1
    notes.push(`${s.parenthetical} 处「（也就是……）」式括号解释。`)
  }

  const threeStep = /首先[^。\n]{0,40}/.test(text) && /其次[^。\n]{0,40}/.test(text) && /(最后|再次)[^。\n]{0,40}/.test(text)
  if (threeStep) {
    points += 1
    notes.push('出现「首先/其次/最后」骨架，没有真实顺序就拆掉。')
  }

  if (s.markdownFree && s.chars > 1200) {
    caveats.push('文本里没有任何 Markdown 标记（加粗、列表、表格），若原文来自 Notion、网页或富文本编辑器，这几项格式指标不可信——扫描到的只有文字层，加粗块、列表项、表格结构在抽取时已经丢了。')
  }

  return { notes, caveats, points }
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
      if (seen >= 20) break
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

  // 词级密度按长度稀释；结构分是绝对计数，不随长度衰减。
  // 判决取两者较重的一个：2 万字文档骨架僵硬，不该因为字多被判 clean。
  const wordDensity = s.chars >= 300 ? score / (s.chars / 300) : score
  const { notes, caveats, points } = structural(source, s)
  const severity = Math.max(wordDensity, points)
  const verdict = severity >= 9 ? 'heavily templated' : severity >= 4 ? 'some templating' : severity > 0 ? 'mostly clean' : 'clean'

  return {
    ok: true,
    lang,
    chars: s.chars,
    stats: s,
    verdict,
    score: Math.round(severity * 10) / 10,
    wordDensity: Math.round(wordDensity * 10) / 10,
    structurePoints: points,
    hitCount: hits.length,
    groups,
    hits: hits.slice(0, limit),
    truncated: hits.length > limit,
    notes,
    caveats,
  }
}
