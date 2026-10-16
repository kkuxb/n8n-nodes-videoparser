# n8n-nodes-videoparser

一个用于解析和下载公开社交平台视频的 n8n 社区节点。当前版本为 **1.0.4**，支持抖音、TikTok、Instagram Reels、Facebook、Twitter/X、YouTube、快手和小红书，并将不同平台的返回结果统一为一致的数据结构。图片和图文内容不受支持。

> 本项目只应用于你有权访问和下载的公开内容。请遵守对应平台的服务条款、版权规则和当地法律。

## 支持状态

| 平台 | 解析元数据 | 获取媒体地址 | 自动下载 | 备注 |
| --- | --- | --- | --- | --- |
| 抖音 | ✅ | ✅ | ✅ | 支持分享链接和网页链接 |
| TikTok | ✅ | ✅ | ✅ | 支持视频及音频地址；`/photo/` 图文链接会报错 |
| Instagram Reels/TV | 部分 | ✅ | ✅ | 不支持 `/p/` 图片帖 |
| Facebook | 部分 | ✅ | ✅ | 仅接受 Watch、Reels、videos 等明确视频链接 |
| Twitter/X | ✅ | ✅ | ✅ | 媒体 CDN 在部分网络环境下可能不可达 |
| YouTube | ✅ | ✅ | ✅ | 返回 MP4 和 MP3 地址 |
| 快手 | ✅ | ✅ | ✅ | 从 v1.0.2 开始支持 |
| 小红书 | ✅ | ✅ | ✅ | 仅支持视频笔记；图文笔记会报错 |

支持情况会受到平台风控、地区限制、内容权限以及上游解析服务状态影响。私密、付费、已删除或需要登录的内容不在支持范围内。

## v1.0.4 维护更新

- 将 `btch-downloader` 固定升级到 `6.4.0`，同步更新依赖锁文件
- 本次上游更新涉及依赖维护、构建和发布流程；Node.js 解析接口与响应类型保持兼容
- 延续 v1.0.3 的视频解析、下载行为和输出结构
- 新增 release-it 发布流程，推送 Git 提交、创建版本 tag 和 GitHub Release；npm 包由维护者手动发布

## v1.0.3 主要改进

- 将 `btch-downloader` 固定升级到 `6.0.38`
- 修正 TikTok、Instagram、Facebook 的 SDK 函数映射
- 为每个平台增加独立的返回结构适配器
- 新增快手解析和下载
- 兼容小红书新版 `{ quality, url }` 视频下载结构
- 严格拒绝图片、图文帖和非视频下载响应
- 自动检测时返回实际识别的平台，不再返回 `auto`
- 对上游的失败响应和空媒体结果抛出明确错误
- 使用流式下载，单个媒体文件限制为 250 MiB
- 拒绝 `file:`、本机地址和私有网络媒体地址
- 添加离线单元测试，覆盖所有平台的响应结构

## 安装

### n8n 社区节点

在 n8n 中进入 **设置 > 社区节点**，搜索并安装：

```text
n8n-nodes-videoparser
```

### npm 安装

```bash
npm install n8n-nodes-videoparser
```

安装后重启 n8n。

## 使用方法

1. 在工作流中添加 **Video Parser** 节点。
2. 在“视频链接”中填写公开视频 URL。
3. 平台保持“自动检测”，或手动选择平台。
4. 如果需要把文件写入 n8n 二进制数据，开启“自动下载视频”。
5. 执行节点并将输出连接到存储、数据库或其他后续节点。

### 节点参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 视频链接 | String | 空 | 必填，公开的 HTTP/HTTPS 视频链接 |
| 平台 | Options | 自动检测 | 根据 URL 域名识别，也可以手动指定 |
| 自动下载视频 | Boolean | `false` | 下载视频并输出到 `binary.data` |

自动下载使用 60 秒请求超时和 250 MiB 单文件上限。超出限制时节点会失败，不会把超大文件完整载入内存。

## 输出结构

```json
{
  "platform": "tiktok",
  "contentType": "video",
  "title": "视频标题",
  "author": "作者名称",
  "videoUrl": "https://.../video.mp4",
  "audioUrl": "https://.../audio.mp3",
  "coverUrl": "https://.../cover.jpg",
  "duration": 15000,
  "description": "内容描述",
  "keywords": "",
  "tags": [],
  "stats": {
    "likes": 1000,
    "comments": 50,
    "shares": 20,
    "views": 5000,
    "collects": 100
  },
  "links": [
    { "quality": "HD", "url": "https://..." }
  ],
  "downloads": [],
  "rawData": {}
}
```

字段可用性取决于上游平台。例如 Instagram 和 Facebook 通常不会提供完整作者或互动数据。小红书图文笔记等非视频内容会直接报错；自动下载的视频文件位于 `binary.data`。

## 支持的 URL 域名

自动检测覆盖常用主域名和短链接域名，包括：

- 抖音：`douyin.com`、`iesdouyin.com`
- TikTok：`tiktok.com`、`vm.tiktok.com`、`vt.tiktok.com`
- Instagram Reels/TV：`instagram.com`、`instagr.am`
- Facebook Watch/Reels/videos：`facebook.com`、`fb.watch`
- Twitter/X：`twitter.com`、`x.com`
- YouTube：`youtube.com`、`youtu.be`、`youtube-nocookie.com`
- 快手：`kuaishou.com`、`v.kuaishou.com`
- 小红书：`xiaohongshu.com`、`xhslink.com`

## 实现说明

本节点使用以下组件：

- [`btch-downloader` 6.4.0](https://github.com/hostinger-bot/btch-downloader)：平台解析客户端
- `axios`：媒体流式下载
- `n8n-workflow`：n8n 节点 SDK

`btch-downloader` 是远程解析服务的客户端，并非所有解析都在本机完成。输入的公开媒体 URL 会发送到其上游服务，随后返回由平台 CDN 或第三方下载 CDN 托管的媒体地址。因此：

- 上游后端故障可能导致节点暂时不可用
- 媒体地址通常有有效期，建议解析后尽快使用
- 对隐私敏感或内部地址不要使用本节点
- 固定依赖版本可以避免无人值守部署时出现意外的返回结构变化

## 开发与测试

开发和发布建议使用 Node.js 24.15.0 或更高的 24.x 版本，以满足 release-it 21 的运行要求。

```bash
git clone https://github.com/kkuxb/n8n-nodes-videoparser.git
cd n8n-nodes-videoparser
npm install
npm test
npm run lint
```

常用命令：

```bash
npm run build       # 编译节点和复制图标
npm test            # 构建并运行离线响应结构测试
npm run lint        # ESLint 检查
npm run format      # 格式化 TypeScript 源码
```

测试默认不访问真实平台，避免 CI 因平台风控或上游波动而不稳定。发布前仍建议使用你有权访问的公开样例进行一次在线烟雾测试。

## 维护版本发布

先同步 `package.json`、`package-lock.json` 的版本号，在 README 更新当前版本和对应更新日志，并提交修改。当前分支需要配置远端上游，工作区需要保持干净。

使用已登录的 GitHub CLI 提供认证，在 PowerShell 中执行：

```powershell
$env:GITHUB_TOKEN = gh auth token
try {
    npm run release -- --no-increment --ci
} finally {
    Remove-Item Env:GITHUB_TOKEN
}
```

`--no-increment` 沿用已整理好的版本号。release-it 会运行测试、lint、发布前检查和打包预检，然后推送当前分支、创建 `v<版本号>` tag 和 GitHub Release。Release 正文取自 README 对应版本的更新日志。

配置默认关闭 npm 发布。维护者确认 GitHub Release 后，在对应 tag 的源码目录中手动执行：

```bash
npm publish
```

## 常见问题

### 为什么同一个链接之前能用，现在不能用？

视频平台会调整网页结构、签名和风控规则，上游解析服务也可能暂时故障。先确认内容仍为公开状态，再检查 [`btch-downloader` Releases](https://github.com/hostinger-bot/btch-downloader/releases) 和本项目 Issues。

### 为什么返回了地址但下载失败？

常见原因包括媒体地址过期、当前网络无法访问对应 CDN、平台要求特定地区网络，或者媒体超过 250 MiB 上限。可以关闭自动下载，仅获取地址并交给专用下载流程处理。

## 更新日志

### v1.0.4 (2026-10-16)

- 将 `btch-downloader` 从 `6.0.38` 固定升级到 `6.4.0`
- 同步更新依赖锁文件和版本说明
- 保持节点参数、平台适配和输出结构兼容
- 新增 release-it 发布脚本与配置，自动检查并推送 Git tag 和 GitHub Release
- GitHub Release 使用本节更新日志，npm 发布由维护者手动执行

### v1.0.3 (2026-08-03)

- 兼容小红书 `{ quality, url }[]` 格式的视频下载地址
- 节点改为严格的视频模式，拒绝图片、图文帖和非视频响应
- 限制 Instagram、TikTok 和 Facebook 的非视频入口
- 同步更新节点描述、README 和回归测试

### v1.0.2 (2026-08-03)

- 升级 `btch-downloader` 到 `6.0.38`
- 修复各平台 SDK 函数名和返回结构适配
- 新增快手支持并更新小红书基础结构
- 增加流式下载、大小限制和媒体 URL 安全校验
- 增加离线单元测试并修正文档支持范围

### v1.0.1 (2026-03-08)

- 小红书解析适配修复

### v1.0.0 (2026-03-08)

- 首次发布

## 许可证

[MIT](LICENSE)
