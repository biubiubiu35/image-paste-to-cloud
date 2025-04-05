import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

interface S3ImageUploaderSettings {
    // AWS S3 访问密钥 ID
    accessKeyId: string;
    // AWS S3 访问密钥
    secretAccessKey: string;
    // AWS 区域，例如：us-east-1, ap-northeast-1
    region: string;
    // S3 存储桶名称
    bucket: string;
    // S3 端点 URL，如果是自定义 S3 兼容服务，需要填写完整的 URL
    endpoint: string;
    // 图片存储路径前缀，例如：images/ 或 notes/images/
    pathPrefix: string;
}

const DEFAULT_SETTINGS: S3ImageUploaderSettings = {
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    bucket: '',
    endpoint: '',
    pathPrefix: 'images/'
};

// 根据 region 生成 S3 endpoint
function getS3Endpoint(region: string): string {
    return `https://s3.${region}.amazonaws.com`;
}

export default class S3ImageUploader extends Plugin {
    settings: S3ImageUploaderSettings;
    s3Client: S3Client;

    async onload() {
        await this.loadSettings();
        this.initializeS3Client();

        // 注册粘贴事件
        this.registerEvent(
            this.app.workspace.on('editor-paste', async (evt: ClipboardEvent, editor: Editor) => {
                if (evt.clipboardData?.files.length) {
                    evt.preventDefault();
                    await this.handlePaste(evt.clipboardData.files, editor);
                }
            })
        );

        // 注册拖拽事件
        this.registerEvent(
            this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor) => {
                if (evt.dataTransfer?.files.length) {
                    evt.preventDefault();
                    await this.handlePaste(evt.dataTransfer.files, editor);
                }
            })
        );

        // 添加设置标签
        this.addSettingTab(new S3ImageUploaderSettingTab(this.app, this));
    }

    initializeS3Client() {
        const endpoint = this.settings.endpoint || getS3Endpoint(this.settings.region);
        this.s3Client = new S3Client({
            region: this.settings.region,
            credentials: {
                accessKeyId: this.settings.accessKeyId,
                secretAccessKey: this.settings.secretAccessKey,
            },
            endpoint: endpoint,
            forcePathStyle: true,
        });
    }

    async handlePaste(files: FileList, editor: Editor) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('image/')) {
                try {
                    const url = await this.uploadImage(file);
                    this.insertImageToEditor(editor, url, file.name);
                } catch (error) {
                    new Notice(`Failed to upload image: ${error.message}`);
                }
            }
        }
    }

    async uploadImage(file: File): Promise<string> {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // 计算文件内容的哈希值
        const hash = createHash('sha256').update(buffer).digest('hex');
        
        // 获取文件扩展名
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        
        // 生成文件名：哈希值 + 扩展名
        const key = `${this.settings.pathPrefix}${hash}.${ext}`;

        try {
            const command = new PutObjectCommand({
                Bucket: this.settings.bucket,
                Key: key,
                Body: buffer,
                ContentType: file.type,
            });

            await this.s3Client.send(command);
            const endpoint = this.settings.endpoint || getS3Endpoint(this.settings.region);
            return `${endpoint}/${this.settings.bucket}/${key}`;
        } catch (error) {
            // 如果文件已存在（可能是并发上传），直接返回URL
            if (error.name === 'BucketAlreadyOwnedByYou') {
                const endpoint = this.settings.endpoint || getS3Endpoint(this.settings.region);
                return `${endpoint}/${this.settings.bucket}/${key}`;
            }
            throw error;
        }
    }

    insertImageToEditor(editor: Editor, url: string, fileName: string) {
        const cursor = editor.getCursor();
        const markdownImage = `![${fileName}](${url})`;
        editor.replaceRange(markdownImage, cursor);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.initializeS3Client();
    }
}

class S3ImageUploaderSettingTab extends PluginSettingTab {
    plugin: S3ImageUploader;

    constructor(app: App, plugin: S3ImageUploader) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'S3 Image Uploader Settings' });

        new Setting(containerEl)
            .setName('Access Key ID')
            .setDesc('Your AWS S3 Access Key ID')
            .addText(text => text
                .setPlaceholder('Enter your access key ID')
                .setValue(this.plugin.settings.accessKeyId)
                .onChange(async (value) => {
                    this.plugin.settings.accessKeyId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Secret Access Key')
            .setDesc('Your AWS S3 Secret Access Key')
            .addText(text => text
                .setPlaceholder('Enter your secret access key')
                .setValue(this.plugin.settings.secretAccessKey)
                .onChange(async (value) => {
                    this.plugin.settings.secretAccessKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Region')
            .setDesc('AWS Region (e.g., us-east-1, ap-northeast-1)')
            .addText(text => text
                .setPlaceholder('Enter region')
                .setValue(this.plugin.settings.region)
                .onChange(async (value) => {
                    this.plugin.settings.region = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Bucket')
            .setDesc('S3 Bucket Name')
            .addText(text => text
                .setPlaceholder('Enter bucket name')
                .setValue(this.plugin.settings.bucket)
                .onChange(async (value) => {
                    this.plugin.settings.bucket = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Endpoint')
            .setDesc('Optional: Custom S3 endpoint URL. Leave empty to use AWS default endpoint (https://s3.{region}.amazonaws.com). Only required for custom S3-compatible services.')
            .addText(text => text
                .setPlaceholder('Enter custom endpoint URL (optional)')
                .setValue(this.plugin.settings.endpoint)
                .onChange(async (value) => {
                    this.plugin.settings.endpoint = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded images (e.g., images/ or notes/images/)')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(this.plugin.settings.pathPrefix)
                .onChange(async (value) => {
                    this.plugin.settings.pathPrefix = value;
                    await this.plugin.saveSettings();
                }));
    }
} 