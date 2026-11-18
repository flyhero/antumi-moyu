# antumi-moyu

两个 [Antumi](https://github.com/flyhero/antumi) 插件：在 Antumi 里看 linux.do 或 V2EX 的帖子，界面和 AI 聊天页一样。两个社区各是一个插件，只装自己要的那个，也可以都装。

- 话题列表是「会话」，楼主的帖子是你发的消息，每一楼回复是助手的回答。
- 配色、字体跟着 Antumi 当前的主题走。
- 匿名只读：不登录，不发帖，不点赞。

## 安装

需要支持插件页面的 Antumi（插件 `manifest.json` 的 `engines.antumi` 写着最低版本）。更早的版本安装时会报清单格式错误。

| 社区 | 附件名 | 侧栏入口 |
|---|---|---|
| linux.do | `antumi-moyu-linuxdo.zip` | 阅读 L |
| V2EX | `antumi-moyu-v2ex.zip` | 阅读 V |

在 Antumi 里打开「设置 → 插件 → 从其他位置安装」：

- **GitHub Release**：仓库填 `flyhero/antumi-moyu`，「ZIP 附件名」填上表里的名字。两个都要就装两次。以后在同一页点「检查并更新」就能升级。
- **本地文件**：从 [Releases](https://github.com/flyhero/antumi-moyu/releases) 下载对应的 ZIP 后选择它。这样装的不会自动找到新版本。

## 用法

点话题打开帖子。输入框是命令行，不会发出任何内容：

| 输入 | 作用 |
|---|---|
| `n` | 下一页 |
| `r` | 刷新列表和当前帖子 |
| `o` | 在内置浏览器打开当前帖子 |
| `q` | 离开，回到会话（连按两次 Esc 也可以） |
| `/latest`、`/hot`、`/python` … | 切换板块，用板块的 id 或名字 |
| 数字 | 跳到那一楼 |
| `?` | 列出全部命令 |

不在输入框里时，`j` / `k` 切到下一个 / 上一个话题。输入框下面可以开关「流式输出」（回复逐条打出来）和图片的显示方式。

帖子列表缓存 3 分钟，到期后自动刷新一次；页面隐藏时等回到页面再刷新。成功后重新计时，失败时保留列表并显示错误，等你手动重试。帖子正文不会自动刷新，可用 `r` 更新。

列表顶部、频道名称左侧的刷新图标只更新帖子列表，不会重新加载正在读的帖子；请求期间图标转动，暂时不能重复点击。

## 限制

- **linux.do 限流很紧。** 十几秒内连着点几个帖子就可能被拦，页面会提示过一会儿再试。除当前可见列表缓存到期后的刷新外，插件只在你操作时请求，不在后台刷新或自动重试。
- **代理**：跟着系统的 HTTPS 代理走（macOS 和 Windows 的系统代理设置）；设了 `HTTPS_PROXY`、`ALL_PROXY` 或 `HTTP_PROXY` 环境变量时以环境变量为准，`NO_PROXY` 和系统的例外列表里的地址直连。只支持 HTTP 代理，系统里只配了 SOCKS 或 PAC 脚本时按直连处理。Linux 只读环境变量。
- **图片默认折叠**，点开才加载；图片所在的站点能看到你的 IP，和用浏览器看帖一样。论坛自己的表情直接显示。
- linux.do 需要登录才能看的板块和帖子看不到。V2EX 一次取回帖子的全部回复。

## 开发

```sh
npm ci
npm run check     # 类型检查、测试、构建 dist/antumi-moyu-linuxdo.zip 和 dist/antumi-moyu-v2ex.zip
npm run preview   # http://127.0.0.1:4173 ，用假数据在浏览器里看页面；加 ?only=v2ex 看单个社区的样子
```

`src/` 是两个插件共用的后台，`page/` 是共用的页面，`plugins/<社区>/` 是每个插件自己的清单和入口，约定见 [AGENTS.md](AGENTS.md)。接口和限制见 Antumi 的 [插件文档](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md)。

发布：`package.json` 和两个 `plugins/*/manifest.json` 改成同一个版本号，推送标签 `v<版本号>`，Release 工作流会构建并把两个 ZIP 附在同一个 Release 上。ZIP 的名字不带版本号，Antumi 靠这个名字在最新的 Release 里找到更新。
