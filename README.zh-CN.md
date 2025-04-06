# Image Paste to Cloud for Obsidian

> 一个 Obsidian 插件，支持将图片自动上传到对象存储服务（AWS S3、Cloudflare R2 等）。

[English Documentation](README.md)

## 功能特性

- 🚀 一键上传：复制粘贴或拖拽图片，自动上传到云端
- 🌐 支持多种存储服务：AWS S3、Cloudflare R2
- 📁 智能文件管理：自动生成唯一文件名，按日期组织

## 安装

1. 打开 Obsidian 设置
2. 进入"第三方插件"
3. 关闭"安全模式"
4. 点击"浏览"，搜索 "Image Paste to Cloud"
5. 安装并启用插件

## 快速开始

### 基础配置

1. 打开插件设置
2. 选择存储服务类型（S3 或 R2）
3. 填写相应的配置信息
4. 点击保存

### 开始使用

- **粘贴上传**：复制图片后直接粘贴到编辑器
- **拖拽上传**：将图片文件拖入编辑器
- **文件选择**：使用命令面板选择"插入图片"

## 详细配置

### AWS S3 配置

1. 创建 S3 存储桶
2. 创建 IAM 用户并获取访问凭证
3. 配置存储桶权限和 CORS（复制 [cors.json](cors.json) 的内容）
4. 在插件中填写配置：
   - Access Key ID
   - Secret Access Key
   - Region
   - Bucket Name

5. **配置 CDN（可选）**：
   - 在 CloudFront 创建新的分配
   - 源站选择你的 S3 存储桶
   - 配置自定义域名（如 `images.yourdomain.com`）
   - 在插件设置中填写自定义域名

### Cloudflare R2 配置

1. **创建 R2 存储桶**：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
   - 进入 R2 页面
   - 点击"Create bucket"
   - 输入存储桶名称

2. **获取 API 凭证**：
   - 在 R2 页面点击"Manage R2 API Tokens"
   - 选择"Create API Token"
   - 设置权限：
     - 权限类型选择"Object Read & Write"
     - 存储桶访问范围选择特定存储桶
   - 创建令牌后保存：
     - Access Key ID
     - Secret Access Key

3. **获取 endpoint**：
   - 在 R2 页面点击存储桶名称
   - 在存储桶详情页面找到"S3 API"字段
   - 直接复制完整的 endpoint URL 即可
   - 例如：`https://f232e0d6b783b70a05628455b22ed1a3.r2.cloudflarestorage.com/cursor101`
   - 插件会自动处理 URL 格式

4. **配置 CORS**：
   - 在存储桶设置中找到"CORS"选项
   - 复制 [cors.json](cors.json) 的内容并粘贴

5. **配置自定义域名（可选）**：
   - 在 Cloudflare 控制面板中选择你的域名
   - 进入"DNS"设置
   - 添加新的 CNAME 记录：
     - 名称：如 `images`
     - 目标：你的 R2 endpoint
     - 代理状态：开启（橙色云朵）
   - 在插件设置中填写自定义域名：`images.yourdomain.com`

## 使用方法

### 文件命名规则

上传的图片将按以下规则组织：
- 目录结构：`{pathPrefix}/{YYYY}/{MM}/{DD}/`
- 文件名格式：`{originalName}-{hash}.{ext}`

示例：`images/2024/03/15/screenshot-1a2b3c4d.png`

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 安装到开发环境
npm run install-plugin
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT License](LICENSE) 