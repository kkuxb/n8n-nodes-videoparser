# 发布指南

## 发布到 GitHub

### 1. 推送代码到 GitHub

```bash
cd /d/n8n-nodes-videoparser
git branch -M main
git push -u origin main
```

### 2. 创建 Release

1. 访问 https://github.com/kkuxb/n8n-nodes-videoparser
2. 点击 "Releases" > "Create a new release"
3. 标签版本: `v1.0.0`
4. 发布标题: `v1.0.0 - 首次发布`
5. 描述内容：

```markdown
## 🎉 首次发布

n8n-nodes-videoparser 是一个 n8n 社区节点，用于解析和下载来自多个视频平台的视频。

### ✨ 功能特性

- ✅ 支持 15+ 视频平台（抖音、快手、B站、TikTok、Instagram、YouTube 等）
- ✅ 自动平台识别
- ✅ 无水印视频下载
- ✅ 完整元数据提取
- ✅ 可选视频下载功能
- ✅ 轻量级，无外部依赖

### 📦 安装

在 n8n 中，进入 **设置 > 社区节点**，搜索 `n8n-nodes-videoparser` 并安装。

或手动安装：
\`\`\`bash
npm install n8n-nodes-videoparser
\`\`\`

### 📖 文档

完整文档请查看 [README.md](https://github.com/kkuxb/n8n-nodes-videoparser/blob/main/README.md)

### 🙏 致谢

- [btch-downloader](https://github.com/hostinger-bot/btch-downloader) - 核心视频解析库
- [n8n](https://n8n.io/) - 工作流自动化平台
```

6. 点击 "Publish release"

---

## 发布到 NPM

### 1. 登录 NPM

```bash
npm login
```

输入你的 NPM 账号信息。

### 2. 发布前检查

```bash
cd /d/n8n-nodes-videoparser

# 运行 lint 检查
npm run lint

# 确保构建成功
npm run build

# 检查打包内容
npm pack --dry-run
```

### 3. 发布到 NPM

```bash
npm publish
```

如果是第一次发布，可能需要：

```bash
npm publish --access public
```

### 4. 验证发布

访问 https://www.npmjs.com/package/n8n-nodes-videoparser 确认包已发布。

---

## 发布后步骤

### 1. 更新 n8n 社区节点列表

访问 https://github.com/n8n-io/n8n/issues 提交一个 issue，请求将你的节点添加到社区节点列表。

### 2. 社区推广

- 在 n8n 社区论坛发帖介绍你的节点
- 在 Twitter/X 上分享
- 在相关技术社区分享

### 3. 监控反馈

- 关注 GitHub Issues
- 关注 NPM 下载量
- 收集用户反馈

---

## 版本更新流程

### 1. 更新代码

修改代码并测试。

### 2. 更新版本号

```bash
# 补丁版本（bug 修复）
npm version patch

# 次要版本（新功能）
npm version minor

# 主要版本（破坏性更改）
npm version major
```

### 3. 更新 CHANGELOG

在 README.md 的"更新日志"部分添加新版本信息。

### 4. 提交并推送

```bash
git push && git push --tags
```

### 5. 发布到 NPM

```bash
npm publish
```

### 6. 创建 GitHub Release

在 GitHub 上创建对应版本的 Release。

---

## 注意事项

### NPM 发布前检查清单

- [ ] package.json 中的版本号已更新
- [ ] README.md 文档完整
- [ ] LICENSE 文件存在
- [ ] .gitignore 配置正确
- [ ] 构建成功（npm run build）
- [ ] Lint 检查通过（npm run lint）
- [ ] 测试通过
- [ ] CHANGELOG 已更新

### GitHub 发布前检查清单

- [ ] 代码已提交并推送
- [ ] 标签已创建
- [ ] Release 描述完整
- [ ] 文档链接正确

### 常见问题

**Q: npm publish 失败，提示权限错误**
A: 确保已登录 NPM 账号，并且包名未被占用。

**Q: 如何撤销已发布的版本？**
A: 使用 `npm unpublish n8n-nodes-videoparser@版本号`，但只能在发布后 72 小时内撤销。

**Q: 如何更新已发布的包描述？**
A: 修改 package.json 后重新发布新版本。

---

## 维护建议

1. **定期更新依赖**: 每月检查并更新 btch-downloader 等依赖
2. **监控 Issues**: 及时回复用户问题
3. **收集反馈**: 根据用户反馈改进功能
4. **安全更新**: 关注安全漏洞并及时修复
5. **文档维护**: 保持文档与代码同步

---

## 联系方式

- GitHub: https://github.com/kkuxb/n8n-nodes-videoparser
- NPM: https://www.npmjs.com/package/n8n-nodes-videoparser
- Issues: https://github.com/kkuxb/n8n-nodes-videoparser/issues
