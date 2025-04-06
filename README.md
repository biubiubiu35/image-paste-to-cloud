# Obsidian Object Storage Uploader (OOSU)

一个简单高效的 Obsidian 插件，支持将图片**自动上传**到各种对象存储服务（如 AWS S3、Cloudflare R2 等）。只需简单的复制粘贴或拖拽操作，图片就会自动上传到云端并插入 Markdown 链接。

## 🚀 Quick Start

### 1. 安装插件
1. 在 Obsidian 中打开设置
2. 进入社区插件
3. 点击浏览社区插件
4. 搜索 "Obsidian Object Storage Uploader"
5. 点击安装

### 2. 配置存储服务（以 Cloudflare R2 为例）
1. 在 Cloudflare 控制台创建 R2 存储桶
2. 获取 Access Key ID 和 Secret Access Key
3. 获取 R2 endpoint URL（格式：`https://{accountId}.r2.cloudflarestorage.com`）
4. 在插件设置中：
   - 选择服务类型：Cloudflare R2
   - 填入 Access Key ID 和 Secret Access Key
   - 填入存储桶名称
   - 填入 R2 endpoint URL
   - 其他设置保持默认即可

### 3. 开始使用
- 复制图片并粘贴到编辑器中
- 或直接拖拽图片到编辑器
- 图片会自动上传并插入链接

## ✨ 特性

- 🚀 **一键上传**: 复制粘贴或拖拽图片，自动上传到云端
- 🖼️ 支持直接粘贴图片上传
- 🖱️ 支持拖拽图片上传
- 🔄 智能文件名管理，避免冲突
- 📁 支持自定义存储路径
- 🌐 支持多种对象存储服务
- ⚙️ 简单直观的设置界面
- 🔒 安全的凭证管理

## 🌐 支持的存储服务

- AWS S3
- Cloudflare R2
- 其他 S3 兼容服务

## ⚙️ 详细配置

### 1. 基本设置

在插件设置中配置以下信息：

- **Service Type**: 选择存储服务类型（AWS S3 或 Cloudflare R2）
- **Access Key ID**: 对象存储服务的访问密钥 ID
- **Secret Access Key**: 对象存储服务的访问密钥
- **Region**: 存储区域（仅 S3 需要）
- **Bucket**: 存储桶名称
- **Endpoint**: 服务端点 URL
  - S3: 可选，默认使用官方端点
  - R2: 必填，格式为 `https://{accountId}.r2.cloudflarestorage.com`
- **Custom Domain**: 自定义域名（用于 CDN 加速）
- **Path Prefix**: 图片存储路径前缀（例如：images/）

### 2. 存储服务配置

#### Cloudflare R2（推荐）

1. **创建存储桶**：
   - 登录 Cloudflare 控制台
   - 进入 R2 页面
   - 点击 "Create bucket"
   - 输入存储桶名称
   - 点击 "Create bucket" 完成创建

2. **获取访问凭证**：
   - 在 R2 页面，点击 "Manage R2 API Tokens"
   - 点击 "Create API Token"
   - 选择权限（建议选择 "Edit" 权限）
   - 选择要访问的存储桶
   - 点击 "Create API Token"
   - 保存生成的 Access Key ID 和 Secret Access Key

3. **配置 CORS**：
   - 在存储桶设置中找到 "CORS" 选项
   - 添加以下 CORS 配置：
   ```json
   {
       "corsRules": [
           {
               "allowedHeaders": ["*"],
               "allowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
               "allowedOrigins": [
                   "app://obsidian.md",
                   "app://obsidian.md/*",
                   "capacitor://localhost",
                   "http://localhost",
                   "http://localhost:*",
                   "capacitor://*",
                   "app://*"
               ],
               "exposeHeaders": [
                   "ETag",
                   "x-amz-server-side-encryption",
                   "x-amz-request-id",
                   "x-amz-id-2"
               ],
               "maxAgeSeconds": 3000
           }
       ]
   }
   ```

#### AWS S3

1. 创建 S3 存储桶
2. 配置 CORS 规则（同上）
3. 配置 CDN（可选）：
   - 使用 CloudFront 或其他 CDN 服务
   - 创建分发，将源站设置为 S3 存储桶
   - 配置自定义域名（例如：cdn.example.com）
   - 在插件设置中填入自定义域名

### CORS 配置

#### AWS S3
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": [
            "app://obsidian.md",
            "app://obsidian.md/*",
            "capacitor://localhost",
            "http://localhost",
            "http://localhost:*",
            "capacitor://*",
            "app://*"
        ],
        "ExposeHeaders": [
            "ETag",
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

#### Cloudflare R2
```json
[
    {
        "AllowedOrigins": [
            "app://obsidian.md",
            "app://obsidian.md/*",
            "capacitor://localhost",
            "http://localhost",
            "http://localhost:*",
            "capacitor://*",
            "app://*"
        ],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"]
    }
]
```

主要区别：
1. R2 的配置更简单，不需要 `corsRules` 包装
2. R2 只需要配置必要的字段（`AllowedOrigins` 和 `AllowedMethods`）
3. 如果需要访问特定的响应头，可以添加 `ExposeHeaders`
4. 如果需要支持自定义请求头，可以添加 `AllowedHeaders`

注意事项：
- `AllowedOrigins` 必须是有效的 HTTP Origin 值（scheme://host[:port]）
- CORS 规则可能需要最多 30 秒才能生效
- 只有跨域请求才会包含 CORS 响应头

[参考 Cloudflare R2 CORS 配置文档](https://developers.cloudflare.com/r2/buckets/cors/#common-issues)

## 💡 使用方法

### 上传图片

1. **粘贴上传**:
   - 复制图片到剪贴板
   - 在 Obsidian 编辑器中粘贴
   - 图片会**自动上传到云端**并插入 Markdown 链接

2. **拖拽上传**:
   - 直接拖拽图片到编辑器中
   - 图片会**自动上传到云端**并插入 Markdown 链接

3. **插入图片**:
   - 使用命令面板或快捷键
   - 选择本地图片文件
   - 图片会**自动上传到云端**并插入 Markdown 链接

### 文件名生成规则

所有上传的图片都会使用统一的命名规则：
- 目录结构：`{pathPrefix}{YYYY}/{MM}/{DD}/`
- 文件名格式：`{originalName}-{hash}.{ext}`
  - `originalName`: 原始文件名（去除特殊字符）
  - `hash`: 文件内容的 MD5 哈希值（前8位）
  - `ext`: 文件扩展名

例如：
- `images/2024/03/15/screenshot-1a2b3c4d.png`
- `images/2024/03/15/clipboard-5e6f7g8h.png`

## 🔜 即将推出的功能

1. **更多存储服务支持**
   - 其他 S3 兼容服务

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 安装到 Obsidian 开发仓库
npm run install-plugin
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [Obsidian](https://obsidian.md) - 优秀的笔记应用
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) - AWS 开发工具包
