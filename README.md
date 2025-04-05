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
- Cloudflare R2 (即将支持)
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

- **Access Key ID**: 对象存储服务的访问密钥 ID
- **Secret Access Key**: 对象存储服务的访问密钥
- **Region**: 存储区域（例如：us-east-1）
- **Bucket**: 存储桶名称
- **Endpoint**: 自定义端点 URL（可选）
- **Path Prefix**: 图片存储路径前缀（例如：images/）
- **Naming Strategy**: 文件名生成策略
  - **Date-based**: 按日期组织目录，文件名自动添加序号
  - **Simple**: 直接使用文件名，自动添加序号

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

3. **验证配置**：
   ```bash
   aws s3api get-bucket-cors --bucket your-bucket-name
   ```

注意事项：
- 确保存储桶的权限设置允许公共读取访问（如果需要）
- 如果使用自定义域名，需要在 AllowedOrigins 中添加相应域名
- 配置更改可能需要几分钟才能生效

#### Cloudflare R2 (即将支持)

配置说明将在支持后添加。

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

### 文件名生成策略

1. **Date-based 策略**:
   - 按日期组织目录：`YYYY/MM/DD/`
   - 文件名格式：`原始文件名 序号.扩展名`
   - 示例：`2024/03/15/screenshot 1.png`

2. **Simple 策略**:
   - 直接使用文件名
   - 同名文件自动添加序号
   - 示例：`screenshot 1.png`

### 图片链接格式

上传后的图片会以 Markdown 格式插入：
```markdown
![图片描述](https://your-bucket.s3.region.amazonaws.com/path/to/image.jpg)
```

## 🔜 即将推出的功能

1. **更多存储服务支持**
   - Cloudflare R2
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
