# dsh-direct-human-style

常驻文风约束插件，给 DeepSeek Harness 用。一轮对话开始时把一份直白文风契约写进系统提示词，并配两个按需调用的工具：一个扫描稿子，一个查清单全文。

An always-on prose contract for DeepSeek Harness: one system-prompt section applied to every turn, plus `humanize_check` (pattern and rhythm scan) and `humanize_rules` (the long-form lists, pulled only when needed). Zero runtime dependencies.

## 为什么常驻而不是按需

写作风格约束只有在每轮都生效时才有意义。按需触发的 skill 要用户先说「帮我润色」，模型才想起规则；那时候稿子已经写完、AI 腔已经落地。这个插件在 order 100（persona 之后、工具段落之前）挂一段 1449 字符的契约，默认对所有对话生效。

代价是每轮多花约 1010 tokens。所以长清单不放进提示词，放工具后面。

## 装了什么

**常驻提示词段。** 七条原则：结论先行、直接说是什么、该下判断就下、去掉元话语、具体压抽象、句长自然交替、长度跟着信息走。加必删套话表、必拆句式表、英文镜像和例外条款（纯代码、引文、法条、错误日志不动）。

**`humanize_check`。** 58 条规则（中文 45、英文 13）分八组：平行否定、元话语、伪严谨、套话收尾、抽象大词、拔高、借权威、中文冗余。输入一段文本，返回命中位置、类别和改法，外加统计指标：破折号密度、加粗占比、列表占比、平均句长、段落长度变异系数。纯文本（Notion、网页抽取）里没有任何 Markdown 标记时，格式类指标会单独标注为不可信。判两轴取重的一轴。词级：严重度按 3/2/1 加权，除以「字数/300」（下限 8，避免长文被稀释成 clean）。结构级：序数骨架、标签冒号开头、短句先行、对称否定这四项按绝对条数给分，不随长度衰减。两轴取最大值判四档：`clean` / `mostly clean` / `some templating`（≥4）/ `heavily templated`（≥9）。命中是线索不是判决书，报告里会注明。

**`humanize_rules`。** 取清单全文，四份：

| part | 内容 |
| --- | --- |
| `direct` | 全局直白风格七条原则与替换示例 |
| `gpt` | GPT 腔调 16 条（英文模型特征与中文对应） |
| `deepseek` | DeepSeek 腔调 20 条（中文模型特征） |
| `checkpoints` | A–F 31 个检查点，改别人稿子时用 |
| `all` | 四份拼接 |

## 安装

```bash
dsh plugin --profile desktop add github:pseudonymzjt/dsh-direct-human-style
```

本地开发挂目录：

```bash
dsh plugin --profile desktop add "link:D:\path\to\dsh-direct-human-style"
```

装完重载 profile。插件列表里显示「直白文风 Direct Human Style」。

### Codex 本地插件

公开插件目录不允许包含 lifecycle hooks，所以目录里的一键安装无法复现每轮常驻约束；它最多提供按需使用的写作 skill。GitHub 本地 marketplace 可以分发完整的 Codex 功能，包括审稿 skill、扫描命令和用户级 SessionStart hook。Marketplace 文件位于 `.claude-plugin/marketplace.json`，插件本体位于 `codex-plugin/`。

```bash
codex plugin marketplace add https://github.com/flowingchar/dsh-direct-human-style.git
codex plugin add direct-human-style --marketplace direct-human-style
node ~/.codex/plugins/cache/direct-human-style/direct-human-style/0.1.5/scripts/install-hook.mjs
```

之后在 **Settings → Hooks** 审阅并信任 hook。Codex 桌面版和 CLI 可运行这套本地常驻约束；ChatGPT 的公开目录安装不执行本地 SessionStart hook，只能按需使用写作 skill。

`humanize-writing` skill 提供按需审稿流程；稿件扫描与规则查询命令也包含在插件里。若从仓库 checkout 后本地安装，可把上面脚本路径替换为 `node codex-plugin/scripts/install-hook.mjs`。

审稿扫描示例：

```bash
cat draft.md | node codex-plugin/scripts/check.mjs --lang=zh
node codex-plugin/scripts/rules.mjs checkpoints
```

## 配置

`cordis.patch.yml` 里可传：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉整段注入与工具 |
| `order` | `100` | 提示词段排序 |
| `registerTools` | `true` | 只留提示词、不注册工具 |
| `extraBanned` | `[]` | 追加到提示词末尾的禁用表达 |

## 目录

```
index.js          插件入口：注册提示词段与两个工具
prompt.js         DSH 常驻提示词文本
rules.js          DSH 四份清单全文（硬编码，不读 markdown）
analyze.js        DSH 扫描器：正则规则 + 统计指标
codex-plugin/     独立 Codex 插件包（提示词、规则、hook、skill、命令）
locale/{en,zh}.json  插件列表里的标题与描述
icon.svg          图标
cordis.patch.yml  bundle patch
selftest.mjs      开发自测，不随包发布
```

## 自测

```bash
node selftest.mjs
```

跑脏中文、干净中文、英文三组样本，加四份清单长度检查。

## 规则来源

- A–F 31 个检查点来自 [Humanizer-zh](https://github.com/op7418/Humanizer-zh)（MIT，Copyright (c) 2026 歸藏），本插件把它的编辑逻辑提炼成常驻契约。
- GPT 腔调清单依据 [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)。
- DeepSeek 与中文腔调清单依据 [中文维基：AI生成文的特征](https://zh.wikipedia.org/wiki/Wikipedia:AI%E7%94%9F%E6%88%90%E6%96%87%E7%9A%84%E7%89%B9%E5%BE%B5)，并参考中文写作社区对「AI 味」的归纳。

## 实现说明

零依赖。刻意不 import `@deepseek-ai/dsh-tools`：以 link 方式安装的 bundle 没有自己的 `node_modules`，裸导入宿主包会抛 `ERR_MODULE_NOT_FOUND`，而且失败是静默的——工具不注册、插件不报错。`index.js` 里的 `makeTool` 自己做了参数校验，覆盖 `required` / `string` / `integer` / `array` / `enum`。

DSH 插件继续从根目录的 `prompt.js`、`rules.js` 和 `analyze.js` 加载原有实现。Codex 插件在 `codex-plugin/` 内维护独立副本，互不覆盖入口和打包配置。

## 许可

MIT。上游 Humanizer-zh 同为 MIT，版权归 歸藏；见 [LICENSE](LICENSE)。
