# Tab X

当前版本：**2.0.0**

**一个安静的 Chrome 新标签页仪表盘，用来管理标签、快捷入口和时间。**

Tab X 会替换 Chrome 的新标签页，提供一个本地运行、Apple 风格的清爽仪表盘。左侧显示当前干支时间，右侧显示英文自然语言时钟和已打开标签数量，中间提供搜索框与图标式常用网站入口，主区域则按主域名整理你当前打开的所有标签。2.0.0 进一步优化了稍后再看面板、自动深色模式和底部极简署名区域。

无需服务器。无需账号。无需构建步骤。所有内容都运行在 Chrome 扩展里。

---

## 当前布局

```text
顶部区域
  左侧：干支时钟（年/月/日/时）+ 节气元信息
  右侧：英文自然语言时钟 + 已打开标签数量

起始区域
  居中的搜索框
  图标式 Top sites 快捷入口

主仪表盘
  左侧：按主域名分组的已打开标签，采用紧凑浅色列表
  右侧：稍后再看 + Archived，整合在同一个手风琴卡片中

底部区域
  中间：Design by L + 主题切换图标，两侧使用低调分割线
```

底部区域被压缩成轻量署名，不占用主要操作空间，也不会像工具栏一样抢注意力。

---

## 功能

- **干支时钟头部**：显示当前年、月、日、时的天干地支，并在下方展示节气元信息。
- **英文自然语言时钟**：右上角用英文描述当前时间，例如 `three minutes to twelve`。
- **打开标签计数**：位于英文时钟旁边，会随着标签打开或关闭自动更新。
- **搜索框**：像新标签页的地址栏一样工作；输入网址会直接打开，输入关键词会使用 Chrome 默认搜索。
- **Apple 风格布局**：使用系统字体、冷白色表面、细腻阴影、图标式快捷入口和紧凑署名页脚。
- **自适应深色模式**：跟随系统 `prefers-color-scheme` 自动切换，也可通过底部图标手动切换浅色/深色。
- **Top sites 快捷入口**：优先使用 Chrome `topSites`，当 `topSites` 为空时会回退到历史记录。
- **手动快捷入口**：点击 `+` 添加自定义快捷入口，并保存在本地。
- **拖拽保存快捷入口**：把任意打开的标签行拖到 Top sites 区域，即可保存为快捷入口。
- **移除快捷入口**：悬停后点击小 `x`；手动快捷入口会被删除，自动 Top sites 或历史入口会在 Tab X 中隐藏。
- **按主域名分组打开标签**：用紧凑列表展示，子行缩进，并提供单行 `X` 关闭按钮。
- **打开标签排序**：可按标签数量、域名 A-Z 或最近活跃排序。
- **Homepages 分组**：把 Gmail、X、YouTube、LinkedIn、GitHub 等首页类标签集中到一个清理卡片中。
- **重复标签检测**：标记重复 URL，并可一键关闭多余副本，只保留一个。
- **点击标签标题跳转**：可以直接切换到对应标签，即使它在另一个 Chrome 窗口里。
- **关闭反馈**：关闭标签时提供 swoosh 声音和礼花动画。
- **稍后再看**：关闭前可把标签保存到本地清单；打勾后的项目会进入同一卡片内的 Archived 手风琴区域，并可删除。
- **局部更新交互**：保存、归档、删除右侧记录时只更新当前条目和计数，避免整块列表反复刷新。
- **同步存储工具**：提供可导入的 `chrome.storage.sync` 工具模块，只保存 `url`、`title`、`timestamp`，避免同步配额被 favicon 或大字段占满。
- **Localhost 分组**：显示端口号，方便区分本地开发项目。
- **可展开分组**：每组默认显示前 8 个标签，更多标签通过 `+N more` 展开。
- **100% 本地数据存储**：使用 Chrome 扩展 API 和 `chrome.storage.local`。

---

## 手动安装

如果还没有克隆仓库，先执行：

```bash
git clone git@github.com:itouchgod/tab-x.git
cd tab-x
```

1. 打开 Chrome，进入 `chrome://extensions`。
2. 打开右上角的 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择本仓库里的 `extension/` 文件夹。
5. 打开一个新标签页。

如果之前已经加载过 Tab X，修改代码后只需要在 `chrome://extensions` 的扩展卡片上点击 **Reload**。

---

## 使用方式

- 在搜索框输入关键词或网址，用来搜索或打开网页。
- 使用 Open tabs 的排序菜单，在标签数量、域名 A-Z、最近活跃之间切换。
- 点击 Top sites 快捷入口，在当前标签页打开对应网站。
- 点击 Top sites 里的 `+` 添加自定义快捷入口。
- 把 **Open tabs** 中的标签行拖到 **Top sites**，保存为快捷入口。
- 悬停 Top sites 快捷入口并点击 `x`，即可删除或隐藏它。
- 点击打开标签行，切换到对应标签。
- 点击标签行上的书签图标，将标签保存到稍后再看，然后再关闭。
- 勾选稍后再看项目会将其归档；Archived 中的记录可以删除。
- 点击标签行上的 `x`，只关闭这一条标签。
- 点击多标签域名分组上的 **Close All**，关闭该分组。
- 当出现重复标签提示时，点击 **Close duplicates** 清理重复标签。

---

## 数据与权限

| 区域 | API / 存储 |
| --- | --- |
| 新标签页替换 | Chrome Manifest V3 `chrome_url_overrides.newtab` |
| 读取与聚焦打开标签 | `chrome.tabs`, `chrome.windows` |
| 打开标签数量徽标 | service worker 中的 `chrome.action` |
| 搜索 | `chrome.search`，并带有 URL 回退逻辑 |
| Top sites | `chrome.topSites` |
| 快捷入口历史回退 | `chrome.history` |
| 网站图标 | Chrome 扩展 `/_favicon/` API，并用首字母占位兜底 |
| 新标签页 favicon | 内置 Chrome 风格 `icons/newtab-favicon.svg` 资源 |
| 稍后再看界面 | `chrome.storage.local` key `deferred` |
| 同步存储工具 | `chrome.storage.sync` keys `savedForLater`, `archived`；写入前压缩为 `url`, `title`, `timestamp` |
| 手动快捷入口 | `chrome.storage.local` key `favoriteLinks` |
| 隐藏的自动快捷入口 | `chrome.storage.local` key `hiddenTopSiteUrls` |
| 打开标签排序偏好 | `chrome.storage.local` key `openTabsSortMode` |
| 声音 | Web Audio API |
| 礼花动画 | DOM/CSS animation |

Tab X 不运行服务器，也不需要 Node.js、npm 或数据库。

---

## 项目结构

```text
extension/
  manifest.json      Chrome 扩展清单
  index.html         新标签页结构
  style.css          仪表盘样式
  app.js             仪表盘逻辑和 UI 交互
  storageSync.js     可导入的 chrome.storage.sync 稍后再看/归档记录工具
  background.js      工具栏标签数量徽标 service worker
  icons/             扩展图标
```

---

## 开发说明

- `extension/config.local.js` 会被刻意忽略，可用于个人首页或分组规则。
- 修改文件后，在 `chrome://extensions` 重新加载未打包扩展。
- 如果权限发生变化，Chrome 可能会在重新加载扩展时要求确认。
- Top sites 和域名分组这类站点级图标会使用 Chrome 原生扩展 `/_favicon/` provider，并传入站点根地址，以获得更稳定的 logo；单个标签行会使用具体页面地址，必要时再回退到 Chrome 已知的 `tab.favIconUrl`。
- 浏览器标签栏里的 favicon 在 `index.html` 中声明为 `icons/newtab-favicon.svg`，可以稳定显示，并且不会继续复用 Tab X 的扩展图标。
- `storageSync.js` 会严格清洗同步数据，写入 `chrome.storage.sync` 前会移除 favicon、base64 图片和其他重字段，只保留跨设备同步真正需要的轻量信息。

---

## 许可证

MIT

Built by L
