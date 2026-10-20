# n8n-nodes-videoparser

一个用于解析和下载公开社交平台视频的 n8n 社区节点。当前版本为 **1.1.0**，支持抖音、TikTok、Instagram Reels、Facebook、Twitter/X、YouTube、快手和小红书，并将不同平台的返回结果统一为一致的数据结构。图片和图文内容不受支持。

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

## v1.1.0 更新

- 抖音改为读取官方移动分享页，支持标准、官方分享、短链接和分享文案；不再请求旧第三方抖音解析接口。
- 匿名 Cookie 仅保存在一次解析/下载的内存上下文中，不要求登录，不输出 Cookie。官方页面最多读取三次，连同短链接解析共用 30 秒总预算。
- 小红书继续使用原解析接口；自动下载时仅对精确的 `sns-video-v28.xhscdn.com` 优先尝试 `sns-video-v4.xhscdn.com`，路径和签名查询不变，失败时有限回退原地址。`zl` 和其他域名暂不转换。
- 这两个平台采用新的流式下载器：全部候选共用 180 秒，连接等待 10 秒、无数据等待 30 秒，文件上限 250 MiB；断流、空文件、超限或长度不符都会失败结束。
- 其他六个平台保留原来的解析和下载实现。节点参数、typeVersion 和 `binary.data` 不变。

抖音移动分享页可能不提供作者的分享/下载权限字段。本节点记录允许、禁止、未知三种状态；明确禁止时停止，字段缺失时保留未知，不声称已获允许。能播放不代表作者允许保存。已删除、私密、要求登录或官方拒绝访问时不增加绕过流程。

### 升级兼容说明

原工作流使用公共输出字段及 `binary.data` 时可沿用配置。抖音 `rawData` 现为脱敏的官方来源摘要，包含 `source`、`awemeId`、`permissions`、`title`、`links`；依赖旧第三方 `rawData` 内部字段的表达式需要调整。抖音 `duration` 为秒，其他平台沿用原单位。

仅解析时，`videoUrl` 是解析器返回的第一个地址。抖音、小红书成功自动下载后，`videoUrl` 是实际下载地址（包含正常重定向的最终地址）；`links` / `downloads` 保留解析来源候选。小红书的国内转换仅用于下载，不承诺上游本身固定返回国内地址，也不保证未来所有视频始终可用。

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

抖音、小红书自动下载使用上述 180 秒总预算；其余平台沿用 60 秒请求超时。单文件上限均为 250 MiB，采用流式传输。

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

- [`btch-downloader` 6.4.0](https://github.com/hostinger-bot/btch-downloader)：除抖音外的平台解析客户端
- `axios`：媒体流式下载
- `tough-cookie` 6.0.0：抖音官方匿名会话的域、路径和协议 Cookie 隔离
- `n8n-workflow`：n8n 节点 SDK

抖音直接请求官方网页，其解析思路来自 MIT 项目，见 [第三方声明](THIRD_PARTY_NOTICES.md)。其他平台使用的 `btch-downloader` 是远程解析服务客户端，其输入 URL 会发送到上游服务，随后返回媒体地址。因此：

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
npm test            # 构建并运行解析、路由和流式下载回归测试
npm run lint        # ESLint 检查
npm run format      # 格式化 TypeScript 源码
```

v1.1.0 包含 39 项自动化测试，覆盖响应结构、平台路由、抖音官方解析到下载的完整节点调用链、小红书国内候选回退，以及本地 HTTP 服务下的空闲超时、断流和总时限。平台 HTTP 响应使用模拟数据，测试不访问真实平台，也不代替 n8n 实例联调；部署时建议使用你有权访问的公开样例进行在线烟雾测试。

## 版本发布

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

配置默认关闭 npm 发布，GitHub Release 不上传安装包。维护者确认 GitHub Release 后，在对应 tag 的源码目录中手动执行：

```bash
npm publish
```

## 常见问题

### 为什么同一个链接之前能用，现在不能用？

视频平台会调整网页结构、签名和风控规则，上游解析服务也可能暂时故障。先确认内容仍为公开状态，再检查 [`btch-downloader` Releases](https://github.com/hostinger-bot/btch-downloader/releases) 和本项目 Issues。

### 为什么返回了地址但下载失败？

常见原因包括媒体地址过期、当前网络无法访问对应 CDN、平台要求特定地区网络，或者媒体超过 250 MiB 上限。可以关闭自动下载，仅获取地址并交给专用下载流程处理。

## 更新日志

### v1.1.0 (2026-10-20)

- 抖音切换到官方移动分享页解析，支持标准链接、短链接和分享文案，添加匿名会话、作品 ID 匹配和分享/下载权限三态，不再调用旧第三方抖音解析服务。
- 小红书保留原解析接口；自动下载时仅将精确匹配的 `sns-video-v28.xhscdn.com` 转为 v4 优先候选，保留路径、签名查询和原地址回退。
- 两个平台的下载增加总预算、连接/空闲时限、流错误传播和完整长度检查。
- 修复媒体响应开始后的空闲超时、抖音搜索链接 `modal_id` 优先级和页面无关文字导致的删除误判。
- 补全成功输出的 `pairedItem` 关联；保留其他六个平台的解析/下载路径、节点参数和 `binary.data` 输出。
- 升级注意：抖音 `rawData` 改为脱敏的官方来源摘要，`duration` 为秒；抖音、小红书自动下载成功后的 `videoUrl` 记录最终下载地址。依赖旧抖音 `rawData` 内部字段的表达式需要调整。
- 新增 `tough-cookie` 6.0.0 和 MIT 参考项目归属声明；自动化测试扩展至 39 项，覆盖解析、下载、候选回退及完整节点调用链，真实平台可用性仍受上游和网络环境影响。

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
