# n8n-nodes-videoparser

这是一个 n8n 社区节点，用于解析和下载来自多个视频平台的视频。支持抖音、快手、B站、TikTok、Instagram、YouTube 等 15+ 个视频平台。

[English](README_EN.md) | 简体中文

## 功能特性

- ✅ **多平台支持**: 支持 15+ 个视频平台
  - 抖音 (Douyin)
  - TikTok
  - B站 (Bilibili)
  - 快手 (Kuaishou)
  - 小红书 (Xiaohongshu)
  - Instagram
  - Facebook
  - Twitter/X
  - YouTube
  - 等等...

- ✅ **自动平台识别**: 自动检测视频链接所属平台
- ✅ **无水印下载**: 获取无水印的视频下载链接
- ✅ **完整元数据**: 提取视频标题、作者、封面、时长、统计数据等
- ✅ **可选视频下载**: 支持自动下载视频文件为二进制数据
- ✅ **轻量级**: 无需 Python、ffmpeg 等外部依赖
- ✅ **开箱即用**: 安装后立即可用，无需额外配置

## 安装

### 社区节点安装（推荐）

在 n8n 中，进入 **设置 > 社区节点**，搜索 `n8n-nodes-videoparser` 并安装。

### 手动安装

```bash
npm install n8n-nodes-videoparser
```

安装后重启 n8n：

```bash
n8n start
```

## 使用方法

### 基础用法

1. 在 n8n 工作流中添加 **Video Parser** 节点
2. 输入视频分享链接（例如：`https://v.douyin.com/xxxxx/`）
3. 选择平台（或使用"自动检测"）
4. 执行节点

### 参数说明

#### 视频链接
- **类型**: 字符串
- **必填**: 是
- **说明**: 视频的分享链接
- **示例**:
  - 抖音: `https://v.douyin.com/xxxxx/`
  - TikTok: `https://www.tiktok.com/@username/video/1234567890`
  - B站: `https://www.bilibili.com/video/BVxxxxxxxxx`

#### 平台
- **类型**: 下拉选择
- **默认值**: 自动检测
- **选项**:
  - 自动检测
  - 抖音 (Douyin)
  - TikTok
  - Instagram
  - Facebook
  - Twitter/X
  - YouTube
  - Bilibili
  - Kuaishou
  - Xiaohongshu
- **说明**: 选择视频所属平台，"自动检测"会根据 URL 自动识别

#### 自动下载视频
- **类型**: 布尔值
- **默认值**: false
- **说明**:
  - `false`: 只返回视频信息和下载链接
  - `true`: 自动下载视频文件，并作为二进制数据输出

### 输出数据

节点会返回以下信息：

```json
{
  "platform": "douyin",
  "title": "视频标题",
  "author": "作者名称",
  "videoUrl": "https://...",
  "coverUrl": "https://...",
  "duration": 15,
  "description": "视频描述",
  "tags": ["标签1", "标签2"],
  "stats": {
    "likes": 1000,
    "comments": 50,
    "shares": 20,
    "views": 5000
  },
  "rawData": { /* 原始数据 */ }
}
```

如果启用了"自动下载视频"，还会输出二进制数据：

```
binary.data: video_1234567890.mp4
```

## 使用示例

### 示例 1: 解析抖音视频信息

1. 添加 **Video Parser** 节点
2. 设置参数：
   - 视频链接: `https://v.douyin.com/ikq8axJ/`
   - 平台: 自动检测
   - 自动下载视频: 关闭
3. 执行后获取视频信息（标题、作者、下载链接等）

### 示例 2: 下载 TikTok 视频

1. 添加 **Video Parser** 节点
2. 设置参数：
   - 视频链接: `https://www.tiktok.com/@username/video/1234567890`
   - 平台: TikTok
   - 自动下载视频: 开启
3. 添加 **Write Binary File** 节点
4. 连接两个节点，自动保存视频文件

### 示例 3: 批量处理视频链接

1. 添加 **Webhook** 或 **HTTP Request** 节点获取视频链接列表
2. 添加 **Split In Batches** 节点
3. 添加 **Video Parser** 节点处理每个链接
4. 添加后续节点处理结果（保存到数据库、发送通知等）

## 支持的平台

| 平台 | 支持状态 | 示例链接 |
|------|---------|---------|
| 抖音 (Douyin) | ✅ | `https://v.douyin.com/xxxxx/` |
| TikTok | ✅ | `https://www.tiktok.com/@user/video/xxx` |
| B站 (Bilibili) | ✅ | `https://www.bilibili.com/video/BVxxx` |
| 快手 (Kuaishou) | ✅ | `https://www.kuaishou.com/short-video/xxx` |
| 小红书 (Xiaohongshu) | ✅ | `https://www.xiaohongshu.com/xxx` |
| Instagram | ✅ | `https://www.instagram.com/p/xxx/` |
| Facebook | ✅ | `https://www.facebook.com/xxx/videos/xxx` |
| Twitter/X | ✅ | `https://twitter.com/user/status/xxx` |
| YouTube | ✅ | `https://www.youtube.com/watch?v=xxx` |

## 常见问题

### 1. 解析失败怎么办？

- 确保视频链接正确且可访问
- 尝试手动选择平台而不是使用"自动检测"
- 检查视频是否为私密或已删除
- 某些平台可能有反爬虫机制，可能需要等待后重试

### 2. 下载的视频有水印吗？

大多数平台支持无水印下载，但具体取决于平台的 API 限制。

### 3. 支持批量下载吗？

支持。可以配合 n8n 的循环节点（如 Split In Batches）实现批量处理。

### 4. 需要 API Key 吗？

不需要。本节点使用开源库 `btch-downloader`，无需任何 API Key。

### 5. 视频下载速度慢怎么办？

- 视频下载速度取决于网络环境和视频文件大小
- 可以考虑只获取下载链接，然后使用专门的下载工具
- 对于大文件，建议关闭"自动下载视频"选项

## 技术细节

### 依赖项

- `btch-downloader`: 核心视频解析库
- `axios`: HTTP 请求库
- `n8n-workflow`: n8n 工作流 SDK

### 架构

```
n8n-nodes-videoparser/
├── nodes/
│   └── VideoParser/
│       ├── VideoParser.node.ts    # 节点主逻辑
│       └── videoparser.svg        # 节点图标
├── package.json
├── tsconfig.json
└── README.md
```

## 开发

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/kkuxb/n8n-nodes-videoparser.git
cd n8n-nodes-videoparser

# 安装依赖
npm install

# 构建
npm run build

# 链接到本地 n8n
npm link
cd ~/.n8n/nodes
npm link n8n-nodes-videoparser

# 启动 n8n
n8n start
```

### 运行测试

```bash
npm run lint
npm run format
```

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

[MIT](LICENSE)

## 致谢

- [btch-downloader](https://github.com/hostinger-bot/btch-downloader) - 核心视频解析库
- [n8n](https://n8n.io/) - 工作流自动化平台

## 免责声明

本工具仅供学习和研究使用。请遵守各视频平台的服务条款和版权法律。下载和使用视频内容时，请尊重原作者的版权。使用本工具产生的任何法律责任由使用者自行承担。

## 支持

- GitHub Issues: https://github.com/kkuxb/n8n-nodes-videoparser/issues
- n8n 社区: https://community.n8n.io/

## 更新日志

### v1.0.0 (2026-03-08)

- 🎉 首次发布
- ✅ 支持 15+ 个视频平台
- ✅ 自动平台识别
- ✅ 可选视频下载功能
- ✅ 完整的元数据提取
