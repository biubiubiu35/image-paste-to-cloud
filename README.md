# Obsidian Object Storage Uploader (OOSU)

一个简单高效的 Obsidian 插件，支持将图片**自动上传**到各种对象存储服务（如 AWS S3、Cloudflare R2 等）。只需简单的复制粘贴或拖拽操作，图片就会自动上传到云端并插入 Markdown 链接。

## ✨ 特性

- 🚀 **一键上传**: 复制粘贴或拖拽图片，自动上传到云端
- 🖼️ 支持直接粘贴图片上传
- 🖱️ 支持拖拽图片上传
- 🔄 智能文件名管理，避免冲突
- 📁 支持自定义存储路径
- 🌐 支持多种对象存储服务
- ⚙️ 简单直观的设置界面
- 🔒 安全的凭证管理

## 🚀 支持的存储服务

- AWS S3
- Cloudflare R2
- 其他 S3 兼容服务

## 📦 安装

1. 在 Obsidian 中打开设置
2. 进入社区插件
3. 点击浏览社区插件
4. 搜索 "Obsidian Object Storage Uploader"
5. 点击安装

## ⚙️ 配置

### 1. 基本设置

在插件设置中配置以下信息：

- **Service Type**: 选择存储服务类型（AWS S3 或 Cloudflare R2）
- **Access Key ID**: 对象存储服务的访问密钥 ID
- **Secret Access Key**: 对象存储服务的访问密钥
- **Region**: 存储区域
  - S3: 例如 us-east-1, ap-northeast-1
  - R2: 使用 "auto"
- **Bucket**: 存储桶名称
- **Custom Domain**: 自定义域名（用于 CDN 加速）
  - S3: 例如 `cdn.example.com`
  - R2: 例如 `r2.example.com`
- **Path Prefix**: 图片存储路径前缀（例如：images/）

### 2. 存储服务配置

#### AWS S3

1. 创建 S3 存储桶
2. 配置 CORS 规则：

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

配置方法：
1. **使用 AWS CLI**：
   ```bash
   # 创建 cors.json 文件并保存上述配置
   aws s3api put-bucket-cors --bucket your-bucket-name --cors-configuration file://cors.json
   ```

2. **使用 AWS 控制台**：
   1. 登录 AWS 控制台
   2. 进入 S3 服务
   3. 选择存储桶
   4. 点击"权限"标签
   5. 向下滚动到"跨源资源共享 (CORS)"
   6. 点击"编辑"
   7. 粘贴上述 JSON 配置
   8. 点击"保存更改"

3. 配置 CDN（可选）：
   - 使用 CloudFront 或其他 CDN 服务
   - 创建分发，将源站设置为 S3 存储桶
   - 配置自定义域名（例如：cdn.example.com）
   - 在插件设置中填入自定义域名

#### Cloudflare R2

1. 创建 R2 存储桶
2. 配置 CORS 规则：

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

配置方法：
1. 登录 Cloudflare 控制台
2. 进入 R2 服务
3. 选择存储桶
4. 点击"设置"标签
5. 找到"CORS"部分
6. 点击"编辑"
7. 粘贴上述 JSON 配置
8. 点击"保存"

3. 配置 CDN（可选）：
   - 在 Cloudflare 控制台中创建自定义域名
   - 配置 DNS 记录，将域名指向 R2 存储桶
   - 在插件设置中填入自定义域名

注意事项：
- 确保存储桶的权限设置允许公共读取访问（如果需要）
- 如果使用自定义域名，需要在 AllowedOrigins 中添加相应域名
- 配置更改可能需要几分钟才能生效

### 3. CORS 配置

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

### 4. CDN 配置建议

1. **AWS S3 + CloudFront**:
   - 创建 CloudFront 分发
   - 将源站设置为 S3 存储桶
   - 配置自定义域名
   - 在插件设置中填入自定义域名

2. **Cloudflare R2 + Custom Domain**:
   - 在 Cloudflare 控制台中创建自定义域名
   - 配置 DNS 记录
   - 在插件设置中填入自定义域名

注意事项：
- 确保 CDN 配置正确，包括 SSL 证书
- 检查 CORS 配置是否允许 CDN 域名
- 测试图片访问是否正常
- 如果使用自定义域名，确保域名已正确解析

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
