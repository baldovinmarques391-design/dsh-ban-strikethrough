# dsh-ban-strikethrough

DSH 插件：**禁止删除线渲染**。在 Harness Web GUI 的聊天、思考过程，以及会话文档预览的 Markdown 页里取消删除线，并把被吃掉的 `~` 字符还原回文本。

- 包名：`dsh-ban-strikethrough`
- Loader 行 id：`ban-strikethrough`
- 形态：Host 空壳（`index.js`）+ 浏览器半边（`client.js`，通过 `package.json` 的 `dsh.client` 声明）

## 为什么会有这个插件

Web 端的 Markdown 渲染器（`@deepseek-ai/dsh-client-ui-primitives` 的直接 mdast→React 渲染）用的 GFM 语法扩展沿用了 micromark 的默认值 `singleTilde: true`，也就是**一个** `~` 就能开一个删除线区间，下一个 `~` 就关掉它。而单个 `~` 在中文技术写作里正是「某某至某某」的区间号，于是一段话里出现两个区间就会互相配对：

```
要求 200400~稳定只给~113134
        └──── 中间全部被划掉，两个 ~ 被吃掉 ────┘
```

模型从来不是要表达「删除」，而渲染结果既难看又丢字符（`3~5` 直接显示成 `35`）。

## 做了什么

`client.js` 在插件生命周期内注入一张样式表（`ctx.effect` 注册，卸载/停用即移除）：

```css
del,
s,
strike { text-decoration: none; }

del::before,
del::after { content: "~"; text-decoration: none; }
```

- 第一条取消删除线本身。
- 第二条把被解析器吃掉的区间号还回文本，于是渲染结果和模型写下的原文逐字符一致。

选择 `del` 元素作为唯一选择器，是因为整个 Web 客户端里**只有** Markdown 渲染器会产出 `<del>`（`case "delete": jsx("del", …)`），而且宿主样式表没有给这个元素写任何规则，所以普通作者规则就能压过浏览器的 UA `line-through`。

### 覆盖范围

| 位置 | 是否覆盖 | 原因 |
|---|---|---|
| 聊天消息、思考过程 | ✅ | 走同一个 Markdown 原语 |
| 会话文档预览的 Markdown 页 | ✅ | `MarkdownBody` 用的就是该原语的 `MarkdownText` |
| 终端 ANSI 删除线（SGR 9） | ❌ 故意不动 | 那是行内 `text-decoration`，是终端内容的真实属性 |
| HTML / PDF / Excel 预览 | ❌ | 独立 iframe 文档，内容是文件自己的，不是模型写的 Markdown |
| 输入框富文本编辑器 | ❌ | 用的是行内 mark，与渲染无关 |

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | 包清单：`dsh.bundle.patch` + `dsh.client`（`platform: web`、`immediately: true`）+ 导出与 `files` |
| `cordis.patch.yml` | 一条 Host 行 `ban-strikethrough`，让插件在插件列表里有独立开关 |
| `index.js` | Host 半边，空实现（行为全在浏览器半边） |
| `client.js` | 浏览器半边：注册工厂 + 注入样式表 |
| `locale/en.json`、`locale/zh.json` | 插件卡片上的标题与说明 |
| `icon.svg` | 插件图标（禁止删除线） |
| `bundle-check.mjs` | 安装前离线自检：清单、`./client` 解析、用 Harness 自己的 loader 解析 patch |

## 安装与开关

装进一个 profile，两种方式都可以：

```sh
dsh plugin --profile web add <path-to-this-checkout>
```

```
plugin_manager { action: "install_bundle", target: "<path-to-this-checkout>" }
```

- 停用/启用：插件列表里找「禁止删除线」，或 `plugin_manager { action: "set_bundle", target: "dsh-ban-strikethrough", enabled: false }`。
- 安装会改 profile（`bundles` 列表 + profile 依赖），所以必须用 Plugin Manager，不要手改 profile。
- 停用后样式表随插件卸载一起移除，不需要重启 Harness；**页面刷新一次**最稳妥。

## 验证

已做的（离线/服务端）：

1. `node --check index.js client.js bundle-check.mjs`；
2. `node bundle-check.mjs` → 15 项全 PASS，包括用 Harness 自己的 loader（`@deepseek-ai/dsh-app-boot` 的 `loadOverlayPatches`）解析 `cordis.patch.yml`；
3. `cordis_inspect_query`（Host `Config.listConfigs`，name = `dsh-ban-strikethrough`）能看到活着的 Loader 行 `include:ban-strikethrough`。

**没做的：页面里的视觉确认。** 本会话没有浏览器控制，而「样式表是否真的生效」只有那个已打开的页面能证明。请刷新该页面后自测：

- 一段话里放两个区间，例如 `范围 3~5 天，稳定后 10~20 天`：应显示原样的 `~`，没有任何横线；
- 打开一个含 `~` 区间的 `.md` 文件，在会话文档预览里看同一段：同样无横线；
- `~~这样的~~` 应显示为 `~这样的~`（不划线，保留一个 `~`）。

## 已知取舍

- 还原出来的 `~` 是 CSS 伪元素内容，**选中复制**时是否带上它取决于浏览器；`del` 里的正文本身从来都在。
- 原文写的是 `~~双波浪号~~` 时只会还原成一个 `~`（CSS 无从得知定界符长度）。考虑到「有意写删除线」的概率约等于零，这个偏差可以接受。
- 如果哪天也想禁掉终端 ANSI 删除线，在同一个样式表里加一条针对行内 `text-decoration` 的规则即可，但那会牺牲终端输出的保真度，所以默认不做。
