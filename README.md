# dsh-direct-human-style

常驻文风约束插件，给 DeepSeek Harness 用。一轮对话开始时把一份直白文风契约写进系统提示词，并配两个按需调用的工具：一个扫描稿子，一个查清单全文。

An always-on prose contract for DeepSeek Harness: one system-prompt section applied to every turn, plus `humanize_check` (pattern and rhythm scan) and `humanize_rules` (the long-form lists, pulled only when needed). Zero runtime dependencies.

## 为什么常驻而不是按需

写作风格约束只有在每轮都生效时才有意义。按需触发的 skill 要用户先说「帮我润色」，模型才想起规则；那时候稿子已经写完、AI 腔已经落地。这个插件在 order 100（persona 之后、工具段落之前）挂一段 1123 字符的契约，默认对所有对话生效。

代价是每轮多花约 800 tokens。所以长清单不放进提示词，放工具后面。

## 装了什么

**常驻提示词段。** 六条原则：结论先行、直接说是什么、该下判断就下、去掉元话语、具体压抽象、句长自然交替。加必删套话表、必拆句式表、英文镜像和例外条款（纯代码、引文、法条、错误日志不动）。

**`humanize_check`。** 46 条规则（中文 37、英文 9）分八组：平行否定、元话语、伪严谨、套话收尾、抽象大词、拔高、借权威、中文冗余。输入一段文本，返回命中位置、类别和改法，外加统计指标：破折号密度、加粗占比、列表占比、平均句长、段落长度变异系数。严重度按 3/2/1 加权、除以每 300 字得到密度，据此判四档：`clean` / `mostly clean` / `some templating`（≥4）/ `heavily templated`（≥9）。命中是线索不是判决书，报告里会注明。

**`humanize_rules`。** 取清单全文，四份：

| part | 内容 |
| --- | --- |
| `direct` | 全局直白风格六条原则与替换示例 |
| `gpt` | GPT 腔调 13 条（英文模型特征与中文对应） |
| `deepseek` | DeepSeek 腔调 16 条（中文模型特征） |
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
prompt.js         常驻提示词文本
rules.js          四份清单全文（硬编码，不读 markdown）
analyze.js        扫描器：正则规则 + 统计指标
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

`rules.js` 是硬编码文本，与上游 markdown 分开维护。改了清单要同步到 `rules.js`，`selftest.mjs` 打印的四份字符数用来发现漏同步。

## 许可

MIT。上游 Humanizer-zh 同为 MIT，版权归 歸藏；见 [LICENSE](LICENSE)。
