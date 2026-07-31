# Tab X Publishing Record

Last updated: July 31, 2026

## Current Store Status

- Extension name: Tab X
- Version: 2.0.1
- Chrome Web Store item ID: `mdpnfjjeclibnejfdcfnbclhdhjannac`
- Review status: Pending review
- Submission date: July 31, 2026
- Publication mode: Publish automatically after review approval
- Publisher contact email: `ukluocn@gmail.com` verified on June 18, 2026

## Store Listing

- Category: Workflow & Planning
- Language: Chinese (Simplified)
- Short description (zh-CN):

```text
把杂乱的标签页整理清楚：自动按网站分组、一键关闭重复标签、常用网站一键直达。全部在本地运行，无需登录，也不会上传你的数据。
```

- Detailed description (zh-CN):

```text
Tab X 是一个新标签页插件，专门解决"标签页开太多，找不到东西"的问题。

打开新标签页时，你会看到：
- 所有已打开的标签页，自动按所属网站分组，一眼看清都开了哪些网站，点一下就能跳过去。
- 重复打开的标签，一键全部关闭，只留一个。
- 常用网站的图标入口（比如你最常访问的几个网站），点一下直接打开，不用再翻收藏夹。
- 一个简单的搜索框，输入网址直接打开，输入关键词就用你原本的搜索引擎搜索，还带输入联想建议。
- "稍后再看"功能：把暂时不想关但也不用马上看的标签存起来，之后随时找回来，看完了可以归档，桌面不会越堆越乱。
- 自动跟随系统切换深色/浅色模式，晚上用不刺眼。

Tab X 完全在你自己的电脑本地运行：
- 不需要注册账号，不需要联网使用。
- 不会收集、上传或出售你的浏览数据。
- 保存的标签和收藏只会通过 Chrome 自带的同步功能，在你自己登录的 Chrome 账号内保存，不会经过任何第三方服务器。

如果你经常同时开几十个标签、找不到自己想要的那个，Tab X 能帮你把它们理清楚。
```

- Price: Free of charge
- Visibility: Public
- Regions: All regions
- Mature content: Off
- Support visibility: Off
- Promo video: None
- Small promo tile: Not provided
- Marquee promo tile: Not provided

## Store Assets

Assets used for the July 31, 2026 submission were prepared locally and are intentionally not tracked in Git.

- Store icon: 128x128 PNG generated from the Tab X icon style
- Screenshot: 1280x800 JPEG based on the latest Tab X new-tab screenshot
- Upload package: `tab-x-2.0.1.zip`

These files belong in local release working folders only, not in the repository:

- `store-assets/`
- `tab-x-*.zip`
- `*.crx`
- `*.pem`

The repository should keep only reusable source assets and documentation, such as:

- `extension/`
- `README.md`
- `README.zh-CN.md`
- `PRIVACY.md`
- `PUBLISHING.md`
- `.gitignore`

## Package Notes

The submitted package was built from the `extension/` directory. Tab X is a plain Manifest V3 extension and does not require a Node.js build step, npm install, server, account system, or database.

Before creating a release package, confirm that the package contains only extension runtime files and excludes local-only files such as `.DS_Store`, release screenshots, prior zip files, or local config.

## Privacy And Permissions

Chrome Web Store privacy form values used for the current submission:

- Single purpose: Tab X replaces the Chrome new tab page with a local dashboard for time, top sites, current open tabs, duplicate tab cleanup, shortcuts, and saved/archive tab records.
- Remote code: No remote JavaScript or WebAssembly.
- Data usage disclosure: Web history.
- Privacy policy URL: `https://github.com/itouchgod/tab-x/blob/main/PRIVACY.md`

Permission justifications:

- `tabs`: read currently open tabs so Tab X can group them by domain, show tab titles, switch to a selected tab, close tabs, and detect duplicate tabs.
- `activeTab`: act on the current tab for scoped new-tab actions such as opening searches or URLs.
- `storage`: store saved-for-later records, archived records, custom shortcuts, hidden shortcut preferences, sort preference, and migration state.
- `topSites`: show Chrome common top sites as shortcut suggestions.
- `history`: provide shortcut suggestions only when Chrome top sites is empty or unavailable.
- `search`: submit non-URL search box text through Chrome's default search provider.
- `favicon`: show site icons for shortcuts, grouped domains, and tab rows.
- `https://suggestqueries.google.com/*`: fetch Google search suggestions while the user types in the new tab search box; Tab X does not inject content scripts into this host or read page content from it.

## GitHub Updates Included

- Extension icon assets were updated to the new Tab X / new-tab favicon visual direction.
- `PRIVACY.md` was added for the Chrome Web Store privacy policy URL.
- `.gitignore` now excludes local release artifacts and upload packages.
- This publishing record documents what was submitted and what should remain local.
