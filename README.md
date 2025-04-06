# Image Paste to Cloud for Obsidian

> An Obsidian plugin that automatically uploads images to object storage services (AWS S3, Cloudflare R2, etc.).

[中文文档](README.zh-CN.md)

## Features

- 🚀 One-click Upload: Copy-paste or drag images to automatically upload to the cloud
- 🌐 Multiple Storage Services: Support for AWS S3, Cloudflare R2
- 📁 Smart File Management: Auto-generate unique filenames, organized by date

## Installation

1. Open Obsidian Settings
2. Go to "Community Plugins"
3. Disable "Safe Mode"
4. Click "Browse" and search for "Image Paste to Cloud"
5. Install and enable the plugin

## Quick Start

### Basic Configuration

1. Open plugin settings
2. Select storage service type (S3 or R2)
3. Fill in the corresponding configuration information
4. Click Save

### Getting Started

- **Paste Upload**: Copy and paste images directly into the editor
- **Drag Upload**: Drag image files into the editor
- **File Selection**: Use command palette to select "Insert Image"

## Detailed Configuration

### AWS S3 Configuration


1. Create an S3 bucket
2. Create an IAM user and obtain access credentials
3. Configure bucket permissions and CORS (copy content from [cors.json](cors.json))
4. Fill in the plugin configuration:
   - Access Key ID
   - Secret Access Key
   - Region
   - Bucket Name

5. **Configure CDN (Optional)**:
   - Create a new distribution in CloudFront
   - Select your S3 bucket as the origin
   - Configure custom domain (e.g., `images.yourdomain.com`)
   - Fill in the custom domain in plugin settings
  
<img src="https://github.com/user-attachments/assets/3ca97844-5013-4aa1-a4b6-caf7bd46c8ec" width="600">


### Cloudflare R2 Configuration

1. **Create R2 Bucket**:
   - Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Go to R2 page
   - Click "Create bucket"
   - Enter bucket name

2. **Get API Credentials**:
   - Click "Manage R2 API Tokens" in R2 page
   - Select "Create API Token"
   - Set permissions:
     - Permission type: "Object Read & Write"
     - Bucket access: Select specific bucket
   - Save after creation:
     - Access Key ID
     - Secret Access Key

<img src="https://github.com/user-attachments/assets/17f0557e-385e-4974-802b-fce35859cdf8" width="600">


3. **Get Endpoint**:
   - Click bucket name in R2 page
   - Find "S3 API" field in bucket details
   - Copy the complete endpoint URL
   - Example: `https://<youraccountid>.r2.cloudflarestorage.com/<bucketname>`
   - Plugin will automatically handle URL format

4. **Configure CORS**:
   - Find "CORS" option in bucket settings
   - Copy content from [cors.json](cors.json) and paste

5. **Configure Custom Domain (Optional)**:
   - Select your domain in Cloudflare dashboard
   - Go to "DNS" settings
   - Add new CNAME record:
     - Name: e.g., `images`
     - Target: Your R2 endpoint
     - Proxy status: Enabled (orange cloud)
   - Fill in custom domain in plugin settings: `images.yourdomain.com`

## Usage

### File Naming Rules

Uploaded images are organized as follows:
- Directory structure: `{pathPrefix}/{YYYY}/{MM}/{DD}/`
- Filename format: `{originalName}-{hash}.{ext}`

Example: `images/2024/03/15/screenshot-1a2b3c4d.png`

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Install to development environment
npm run install-plugin
```

## Contributing

Issues and Pull Requests are welcome!

## License

[MIT License](LICENSE)

## About

This plugin is developed by [Roy](https://github.com/biubiubiu35), the creator of [Cursor101](https://cursor101.com/).
