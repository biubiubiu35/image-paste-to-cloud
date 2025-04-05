import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

class FileNamingService {
    constructor(
        private settings: S3ImageUploaderSettings,
        private s3Client: S3Client
    ) {}

    // 生成云端存储路径
    async generateCloudPath(file: File): Promise<string> {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const originalName = file.name.slice(0, -(ext.length + 1)).replace(/[^a-zA-Z0-9]/g, '-');
        
        // 获取当前日期
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}/${month}/${day}`;
        
        // 计算文件内容的哈希值（取前8位）
        const arrayBuffer = await file.arrayBuffer();
        const hash = createHash('md5').update(Buffer.from(arrayBuffer)).digest('hex').slice(0, 8);
        
        // 生成文件名：原文件名-短哈希.扩展名
        const fileName = `${originalName}-${hash}.${ext}`;
        
        return `${this.settings.pathPrefix}${dateStr}/${fileName}`;
    }
}

export default class S3ImageUploader extends Plugin {
    settings: S3ImageUploaderSettings;
    s3Client: S3Client;
    namingService: FileNamingService;

    async onload() {
        await this.loadSettings();
        this.initializeS3Client();
        this.namingService = new FileNamingService(this.settings, this.s3Client);

        this.addSettingTab(new S3ImageUploaderSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('editor-paste', async (evt: ClipboardEvent, editor: Editor) => {
                if (!evt.clipboardData) return;

                const items = evt.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.startsWith('image/')) {
                        evt.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                            try {
                                const url = await this.uploadImage(file);
                                editor.replaceSelection(`![](${url})`);
                            } catch (error) {
                                console.error('Failed to upload image:', error);
                                new Notice('Failed to upload image. Please check the console for details.');
                            }
                        }
                    }
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-drop', async (evt: DragEvent, editor: Editor) => {
                if (!evt.dataTransfer) return;

                const items = evt.dataTransfer.items;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        evt.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                            try {
                                const url = await this.uploadImage(file);
                                editor.replaceSelection(`![](${url})`);
                            } catch (error) {
                                console.error('Failed to upload image:', error);
                                new Notice('Failed to upload image. Please check the console for details.');
                            }
                        }
                    }
                }
            })
        );

        this.addCommand({
            id: 'insert-image',
            name: 'Insert Image',
            editorCallback: async (editor: Editor) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        try {
                            const url = await this.uploadImage(file);
                            editor.replaceSelection(`![](${url})`);
                        } catch (error) {
                            console.error('Failed to upload image:', error);
                            new Notice('Failed to upload image. Please check the console for details.');
                        }
                    }
                };
                input.click();
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.initializeS3Client();
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
            forcePathStyle: false,
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

    // 生成友好的文件名
    private generateFriendlyFilename(file: File): string {
        // 获取当前日期，格式：YYYY/MM/DD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}/${month}/${day}`;
        
        // 处理原始文件名
        const originalName = file.name;
        const ext = originalName.split('.').pop()?.toLowerCase() || '';
        const baseName = originalName.slice(0, -(ext.length + 1));
        
        // 生成友好文件名：日期/原始文件名-随机字符串.扩展名
        // 使用原始文件名的前20个字符，避免文件名过长
        const friendlyBaseName = baseName.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '-');
        const randomStr = Math.random().toString(36).substring(2, 8);
        return `${dateStr}/${friendlyBaseName}-${randomStr}.${ext}`;
    }

    async uploadImage(file: File): Promise<string> {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // 生成存储路径
        const key = await this.namingService.generateCloudPath(file);

        try {
            const command = new PutObjectCommand({
                Bucket: this.settings.bucket,
                Key: key,
                Body: buffer,
                ContentType: file.type,
            });

            await this.s3Client.send(command);
            // 确保返回的 URL 与上传路径完全匹配
            return `https://${this.settings.bucket}.s3.${this.settings.region}.amazonaws.com/${key}`;
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }

    insertImageToEditor(editor: Editor, url: string, fileName: string) {
        const cursor = editor.getCursor();
        const markdownImage = `![${fileName}](${url})`;
        editor.replaceRange(markdownImage, cursor);
    }
}

class S3ImageUploaderSettingTab extends PluginSettingTab {
    plugin: S3ImageUploader;
    tempSettings: S3ImageUploaderSettings;

    constructor(app: App, plugin: S3ImageUploader) {
        super(app, plugin);
        this.plugin = plugin;
        this.tempSettings = Object.assign({}, plugin.settings);
    }

    async saveSettings() {
        Object.assign(this.plugin.settings, this.tempSettings);
        await this.plugin.saveData(this.plugin.settings);
        this.plugin.initializeS3Client();
        new Notice('Settings saved successfully!');
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
                .setValue(this.tempSettings.accessKeyId)
                .onChange(async (value) => {
                    this.tempSettings.accessKeyId = value;
                }));

        new Setting(containerEl)
            .setName('Secret Access Key')
            .setDesc('Your AWS S3 Secret Access Key')
            .addText(text => text
                .setPlaceholder('Enter your secret access key')
                .setValue(this.tempSettings.secretAccessKey)
                .onChange(async (value) => {
                    this.tempSettings.secretAccessKey = value;
                }));

        new Setting(containerEl)
            .setName('Region')
            .setDesc('AWS Region (e.g., us-east-1, ap-northeast-1)')
            .addText(text => text
                .setPlaceholder('Enter region')
                .setValue(this.tempSettings.region)
                .onChange(async (value) => {
                    this.tempSettings.region = value;
                }));

        new Setting(containerEl)
            .setName('Bucket')
            .setDesc('S3 Bucket Name')
            .addText(text => text
                .setPlaceholder('Enter bucket name')
                .setValue(this.tempSettings.bucket)
                .onChange(async (value) => {
                    this.tempSettings.bucket = value;
                }));

        new Setting(containerEl)
            .setName('Endpoint')
            .setDesc('Optional: Custom S3 endpoint URL. Leave empty to use AWS default endpoint (https://s3.{region}.amazonaws.com). Only required for custom S3-compatible services.')
            .addText(text => text
                .setPlaceholder('Enter custom endpoint URL (optional)')
                .setValue(this.tempSettings.endpoint)
                .onChange(async (value) => {
                    this.tempSettings.endpoint = value;
                }));

        new Setting(containerEl)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded images (e.g., images/ or notes/images/)')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(this.tempSettings.pathPrefix)
                .onChange(async (value) => {
                    this.tempSettings.pathPrefix = value;
                }));

        // 添加保存按钮
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Save Settings')
                .setCta()
                .onClick(async () => {
                    await this.saveSettings();
                }));
    }
} 