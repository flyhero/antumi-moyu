# antumi-moyu

一个 [Antumi](https://github.com/flyhero/antumi) 插件：在 Antumi 里看 linux.do 和 V2EX 的帖子，界面和 AI 聊天页一样。

- 话题列表是「会话」，楼主的帖子是你发的消息，每一楼回复是助手的回答。
- 配色、字体跟着 Antumi 当前的主题走。
- 匿名只读：不登录，不发帖，不点赞。

## 安装

需要支持插件页面的 Antumi（`manifest.json` 的 `engines.antumi` 写着最低版本）。更早的版本安装时会报清单格式错误。

在 Antumi 里打开「设置 → 插件 → 从其他位置安装」：

- **GitHub Release**：填 `flyhero/antumi-moyu`。以后在同一页点「检查并更新」就能升级。
- **本地文件**：从 [Releases](https://github.com/flyhero/antumi-moyu/releases) 下载 ZIP 后选择它。这样装的不会自动找到新版本。

装好后侧栏多一个「阅读」入口。

## 用法

点话题打开帖子。输入框是命令行，不会发出任何内容：

| 输入 | 作用 |
|---|---|
| `n` | 下一页 |
| `r` | 刷新列表和当前帖子 |
| `o` | 在内置浏览器打开当前帖子 |
| `q` | 离开，回到会话（连按两次 Esc 也可以） |
| `/linuxdo`、`/v2ex` | 切换社区 |
| `/latest`、`/hot`、`/python` … | 切换板块，用板块的 id 或名字 |
| 数字 | 跳到那一楼 |
| `?` | 列出全部命令 |

不在输入框里时，`j` / `k` 切到下一个 / 上一个话题。输入框下面可以开关「流式输出」（回复逐条打出来）和图片的显示方式。

## 限制

- **linux.do 限流很紧。** 十几秒内连着点几个帖子就可能被拦，页面会提示过一会儿再试。插件只在你操作时请求，不在后台刷新。
- **不走系统代理。** 插件后台是独立的 Node 进程，直接连论坛。靠系统代理才能访问论坛时会连不上，需要全局或 TUN 模式。
- **图片默认折叠**，点开才加载；图片所在的站点能看到你的 IP，和用浏览器看帖一样。论坛自己的表情直接显示。
- linux.do 需要登录才能看的板块和帖子看不到。V2EX 一次取回帖子的全部回复。

## 开发

```sh
npm ci
npm run check     # 类型检查、测试、构建 dist/antumi-moyu-<版本>.zip
npm run preview   # http://127.0.0.1:4173 ，用假数据在浏览器里看页面
```

`src/` 是后台，`page/` 是页面，约定见 [AGENTS.md](AGENTS.md)。接口和限制见 Antumi 的 [插件文档](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md)。

发布：`package.json` 和 `manifest.json` 改成同一个版本号，推送标签 `v<版本号>`，Release 工作流会构建并附上 ZIP。
