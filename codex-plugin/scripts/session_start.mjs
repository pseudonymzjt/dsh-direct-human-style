import { STYLE_PROMPT } from '../prompt.js'

const codexPrompt = STYLE_PROMPT.replace(
  '细节清单用 `humanize_rules` 检索，交付前审稿用 `humanize_check`。',
  '需要细则时读取插件 skill 的规则清单；交付前可运行其中的稿件扫描命令。',
)

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: codexPrompt,
  },
})}\n`)
