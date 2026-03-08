# n8n-nodes-videoparser 测试指南

## 本地测试步骤

### 1. 链接到本地 n8n

```bash
# 在项目目录中
cd /d/n8n-nodes-videoparser
npm link

# 在 n8n 安装目录中
cd ~/.n8n/custom
npm link n8n-nodes-videoparser
```

### 2. 启动 n8n

```bash
n8n start
```

### 3. 测试用例

#### 测试 1: 抖音视频解析（仅获取信息）

1. 创建新工作流
2. 添加 "Video Parser" 节点
3. 配置：
   - 视频链接: `https://v.douyin.com/ikq8axJ/`
   - 平台: 自动检测
   - 自动下载视频: 关闭
4. 执行节点
5. 预期输出：视频信息（标题、作者、URL等）

#### 测试 2: 抖音视频下载

1. 创建新工作流
2. 添加 "Video Parser" 节点
3. 配置：
   - 视频链接: `https://v.douyin.com/ikq8axJ/`
   - 平台: 抖音 (Douyin)
   - 自动下载视频: 开启
4. 添加 "Write Binary File" 节点
5. 连接两个节点
6. 执行工作流
7. 预期输出：视频文件保存到本地

#### 测试 3: TikTok 视频解析

1. 添加 "Video Parser" 节点
2. 配置：
   - 视频链接: `https://www.tiktok.com/@username/video/1234567890`
   - 平台: TikTok
   - 自动下载视频: 关闭
3. 执行节点
4. 预期输出：TikTok 视频信息

#### 测试 4: 错误处理

1. 添加 "Video Parser" 节点
2. 配置：
   - 视频链接: `https://invalid-url.com/`
   - 平台: 自动检测
3. 执行节点
4. 预期输出：错误信息

### 4. 验证清单

- [ ] 节点在 n8n 中正确显示
- [ ] 节点图标正确显示
- [ ] 所有参数正确显示（中文）
- [ ] 抖音视频解析成功
- [ ] 视频信息完整（标题、作者、URL等）
- [ ] 自动下载功能正常
- [ ] 二进制数据正确输出
- [ ] 错误处理正常
- [ ] 其他平台（TikTok、B站等）解析正常

## 手动测试 btch-downloader

如果需要单独测试 btch-downloader：

```javascript
const btchDownloader = require('btch-downloader');

// 测试抖音
btchDownloader.douyin('https://v.douyin.com/ikq8axJ/')
  .then(result => {
    console.log('Success:', result);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## 常见问题

### 问题 1: 节点不显示

- 确保已运行 `npm run build`
- 确保已正确链接 `npm link`
- 重启 n8n

### 问题 2: 解析失败

- 检查视频链接是否有效
- 检查网络连接
- 尝试手动选择平台而不是自动检测

### 问题 3: 下载失败

- 检查视频 URL 是否可访问
- 检查磁盘空间
- 检查网络速度

## 发布前检查

- [ ] 所有测试用例通过
- [ ] README 文档完整
- [ ] package.json 信息正确
- [ ] LICENSE 文件存在
- [ ] .gitignore 配置正确
- [ ] 构建成功无错误
- [ ] 代码格式化完成
- [ ] Lint 检查通过
