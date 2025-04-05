# S3 Image Uploader for Obsidian

一个简单高效的 S3 图片上传插件，支持直接粘贴和拖拽上传图片到 S3 存储。

## 功能特点

- 支持直接粘贴图片上传
- 支持拖拽图片上传
- 自动生成唯一文件名
- 支持自定义存储路径
- 支持自定义 S3 端点
- 简单直观的设置界面

## 安装

1. 在 Obsidian 中打开设置
2. 进入社区插件
3. 点击浏览社区插件
4. 搜索 "S3 Image Uploader"
5. 点击安装

## 配置

1. 在插件设置中配置以下信息：
   - Access Key ID
   - Secret Access Key
   - Region
   - Bucket
   - Endpoint
   - Path Prefix

## 使用方法

1. 复制图片到剪贴板
2. 在 Obsidian 编辑器中粘贴
3. 图片会自动上传到 S3 并插入 Markdown 链接

或者

1. 直接拖拽图片到编辑器中
2. 图片会自动上传到 S3 并插入 Markdown 链接

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 许可证

MIT
