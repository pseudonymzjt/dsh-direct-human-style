/**
 * dsh-direct-human-style — host half.
 *
 * Two surfaces:
 *   1. an always-on system-prompt section (order 100) carrying the
 *      direct-human-style constraint, so every reply is held to it;
 *   2. two agent tools — humanize_check (pattern + statistics scan) and
 *      humanize_rules (long-form references pulled on demand).
 *
 * The style section is deliberately short: it is paid for on every request,
 * so the 31 checkpoint details live behind humanize_rules instead.
 *
 * Dependency note: the tool objects are built here instead of through
 * `@deepseek-ai/dsh-tools`. A linked (unbuilt) bundle has no node_modules of
 * its own, so a bare import of a host package fails and silently leaves the
 * tools unregistered. `defineTool` only normalises a parameter spec into JSON
 * Schema and wraps `execute` with argument validation — both are done below.
 */

import { STYLE_PROMPT, STYLE_SECTION_NAME, STYLE_SECTION_ORDER } from './prompt.js'
import { analyze } from './analyze.js'
import { INDEX, PARTS, lookup } from './rules.js'

/** Stable cordis plugin name. */
export const name = 'direct-human-style'

/** Services required before the style surface can mount. */
export const inject = ['tools', 'systemPrompt']

const DEFAULTS = {
  enabled: true,
  order: STYLE_SECTION_ORDER,
  registerTools: true,
  extraBanned: [],
}

/** Compose the section text: the fixed prompt plus any user additions. */
function buildPrompt(config) {
  const extra = Array.isArray(config.extraBanned) ? config.extraBanned.filter(Boolean) : []
  if (extra.length === 0) return STYLE_PROMPT
  return `${STYLE_PROMPT}\n\n**用户追加的禁用表达：** ${extra.join(' / ')}`
}

/** One text content block. */
function text(value) {
  return [{ type: 'text', text: value }]
}

/**
 * Build a registry-ready tool definition.
 *
 * @param {object} options
 * @param {string} options.name - model-facing tool name.
 * @param {string} options.description - what it does and when to call it.
 * @param {object} options.parameters - raw JSON Schema for the arguments.
 * @param {(args: object, value: unknown) => object[]} options.render - content blocks.
 * @param {number} [options.timeoutMs] - per-call budget.
 * @param {(args: object, exec: unknown) => unknown} options.execute - the work.
 * @returns {object} the object `ctx.tools.register` expects.
 */
function makeTool(options) {
  const { parameters, execute, render, timeoutMs } = options
  const required = Array.isArray(parameters.required) ? parameters.required : []

  return {
    name: options.name,
    description: options.description,
    parameters,
    output: { schema: {}, render },
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    async execute(args) {
      const value = args ?? {}
      const violations = []
      for (const key of required) {
        if (value[key] === undefined) violations.push(`${key} is required`)
      }
      for (const [key, schema] of Object.entries(parameters.properties ?? {})) {
        const given = value[key]
        if (given === undefined) continue
        const type = schema.type
        if (type === 'string' && typeof given !== 'string') violations.push(`${key} must be a string`)
        if (type === 'integer' && !Number.isInteger(given)) violations.push(`${key} must be an integer`)
        if (type === 'array' && !Array.isArray(given)) violations.push(`${key} must be an array`)
        if (Array.isArray(schema.enum) && !schema.enum.includes(given)) {
          violations.push(`${key} must be one of ${schema.enum.join(', ')}`)
        }
      }
      if (violations.length > 0) {
        return { ok: false, error: `invalid arguments: ${violations.join('; ')}` }
      }
      return execute(value)
    },
  }
}

/** Render a scan result as a readable report. */
function renderScan(_args, value) {
  if (!value || value.ok === false) return text(value?.error ?? '扫描失败。')

  const s = value.stats
  const lines = [
    `判定：${value.verdict}（密度 ${value.score}）· ${value.chars} 字 · ${s.sentences} 句 · 平均句长 ${s.avgSentenceChars} 字`,
    `命中 ${value.hitCount} 处${value.truncated ? '（已截断）' : ''}：${Object.entries(value.groups).map(([g, n]) => `${g} ${n}`).join(' · ') || '无'}`,
  ]

  if (value.notes.length > 0) {
    lines.push('', '结构问题：')
    for (const note of value.notes) lines.push(`- ${note}`)
  }

  if (value.hits.length > 0) {
    lines.push('', '命中明细：')
    for (const hit of value.hits) {
      lines.push(`- L${hit.line}:${hit.col} [${hit.group}/${hit.severity}] ${hit.match}`)
      lines.push(`  上下文：${hit.excerpt}`)
      lines.push(`  改法：${hit.advice}`)
    }
  }

  lines.push('', '命中不等于要改：先看有没有独立信息、是否空泛、是否与文体冲突。')
  return text(lines.join('\n'))
}

/** Render a rules lookup. */
function renderRules(_args, value) {
  if (!value || value.ok === false) return text(value?.error ?? '未找到对应部分。')
  return text(value.markdown)
}

/** The scanning tool. */
function humanizeCheckTool() {
  return makeTool({
    name: 'humanize_check',
    description:
      '按 direct-human-style 规则扫描一段文本，返回命中的套话、平行否定、伪严谨、拔高、借权威、英文 AI 腔，' +
      '以及破折号密度、加粗占比、平均句长、段落均匀度等统计指标。用于交付前自检或审阅用户文档，' +
      '只报线索不改写：命中不等于要改，先看有没有独立信息。' +
      'Triggers: 去掉 AI 味, 检查文风, AI 腔, 太像 AI 写的, 审稿.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要扫描的文本全文' },
        lang: { type: 'string', enum: ['auto', 'zh', 'en'], description: '扫描语种，默认 auto 同时跑中英规则' },
        limit: { type: 'integer', description: '最多返回多少条命中，默认 40，最大 200' },
      },
      required: ['text'],
    },
    render: renderScan,
    timeoutMs: 30_000,
    async execute(args) {
      return analyze(args.text, { lang: args.lang ?? 'auto', limit: args.limit ?? 40 })
    },
  })
}

/** The reference lookup tool. */
function humanizeRulesTool() {
  return makeTool({
    name: 'humanize_rules',
    description:
      '取回 direct-human-style 的细则文本：direct 全局直白风格、gpt 英文模型腔调清单、' +
      'deepseek 中文模型腔调清单、checkpoints 编辑已有文本用的 31 个检查点。' +
      `未指定 part 时返回全部。${INDEX}` +
      'Triggers: 文风规则, 怎么改写, AI 腔清单, humanizer 细则.',
    parameters: {
      type: 'object',
      properties: {
        part: {
          type: 'string',
          enum: PARTS,
          description: '要取回的部分，默认 all',
        },
      },
    },
    render: renderRules,
    timeoutMs: 15_000,
    async execute(args) {
      const part = args.part ?? 'all'
      const markdown = lookup(part)
      if (markdown === null) {
        return { ok: false, error: `未知的 part：${part}。可用：${PARTS.join(' / ')}` }
      }
      return { ok: true, part, chars: markdown.length, markdown }
    },
  })
}

/** All tools this plugin contributes. */
export function humanizerTools() {
  return [humanizeCheckTool(), humanizeRulesTool()]
}

/** Mount the style constraint and the tools. */
export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...(config ?? {}) }

  if (settings.enabled === false) {
    return
  }

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: STYLE_SECTION_NAME,
        order: Number.isFinite(settings.order) ? settings.order : STYLE_SECTION_ORDER,
        text: buildPrompt(settings),
      }),
    'dsh-humanizer-zh: style section',
  )

  if (settings.registerTools !== false) {
    ctx.effect(() => {
      const disposers = humanizerTools().map(tool => ctx.tools.register(tool))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-humanizer-zh: scanning tools')
  }
}
