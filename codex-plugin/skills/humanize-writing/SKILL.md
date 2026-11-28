---
name: humanize-writing
description: Draft, revise, or review Chinese and English prose using the direct-human-style rules. Use when the user asks to remove AI-sounding phrasing, polish prose, or check a draft; preserve facts, voice, and useful structure.
---

# 直白文风写作与审稿

Use this skill when the user asks for prose drafting, revision, or an explicit style review. The short style contract is already loaded at session start; this skill adds the detailed checklist and scan command.

## Workflow

- Keep the user's meaning, facts, tone, and intended audience. Do not edit quotations, laws, error logs, or code as prose.
- Lead with the answer or main claim. Remove framing, filler, repeated claims, vague praise, generic authority, and empty conclusions.
- Prefer concrete actors, actions, evidence, mechanisms, and numbers to abstractions. Keep real caveats, conditions, counterexamples, and distinctions.
- Vary sentence length naturally. Use headings and lists when they clarify real structure; do not force symmetry or a fixed number of sections.
- Treat scanner matches as leads, not verdicts. Inspect context before changing any passage.
- When useful, consult the detailed lists with `node ${PLUGIN_ROOT}/scripts/rules.mjs direct|gpt|deepseek|checkpoints|all`.
- For an explicit audit or a substantial revision, scan the draft by piping it to `node ${PLUGIN_ROOT}/scripts/check.mjs`; choose `--lang=zh` or `--lang=en` when the language is known. Report findings with locations and suggested edits, then make only contextually sound changes.

## Review priorities

Check for parallel denials and empty contrast frames; meta-introductions and repeated paraphrases; faux caution without identifying missing evidence; service-desk closings; inflated abstractions and generic praise; unsourced appeals to unnamed experts; rigid numbered skeletons; repetitive label-colon openings; and formulaic sentence rhythm.

The full prompt and four reference lists are kept in the plugin's existing `prompt.js` and `rules.js` sources. The scaner's hits are heuristic; a match does not establish that a phrase should be removed.
