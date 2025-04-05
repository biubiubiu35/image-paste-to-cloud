import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

interface StorageServiceConfig {
    getEndpoint(bucket: string): string;
    getFileUrl(bucket: string, key: string): string;
    getRegion(): string;
}

class S3Config implements StorageServiceConfig {
    constructor(private region: string, private customEndpoint?: string) {}

    getEndpoint(bucket: string): string {
        return this.customEndpoint || `https://s3.${this.region}.amazonaws.com`;
    }

    getFileUrl(bucket: string, key: string): string {
        return this.customEndpoint 
            ? `${this.customEndpoint}/${key}`
            : `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    getRegion(): string {
        return this.region;
    }
}

class R2Config implements StorageServiceConfig {
    constructor(private customDomain?: string) {}

    getEndpoint(bucket: string): string {
        return this.customDomain 
            ? `https://${this.customDomain}`
            : `https://${bucket}.r2.cloudflarestorage.com`;
    }

    getFileUrl(bucket: string, key: string): string {
        return this.customDomain
            ? `https://${this.customDomain}/${key}`
            : `https://${bucket}.r2.cloudflarestorage.com/${key}`;
    }

    getRegion(): string {
        return 'auto';
    }
}

interface S3ImageUploaderSettings {
    // 存储服务类型
    serviceType: 's3' | 'r2';
    // 访问密钥 ID
    accessKeyId: string;
    // 访问密钥
    secretAccessKey: string;
    // 区域
    region: string;
    // 存储桶名称
    bucket: string;
    // 自定义域名（用于 CDN）
    customDomain: string;
    // 图片存储路径前缀
    pathPrefix: string;
}

const DEFAULT_SETTINGS: S3ImageUploaderSettings = {
    serviceType: 's3',
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    bucket: '',
    customDomain: '',
    pathPrefix: 'images/'
};

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
    storageConfig: StorageServiceConfig;

    async onload() {
        await this.loadSettings();
        this.initializeStorageConfig();
        this.initializeS3Client();
        this.namingService = new FileNamingService(this.settings, this.s3Client);

        this.addSettingTab(new S3ImageUploaderSettingTab(this.app, this));

        this.registerEventHandlers();
    }

    private initializeStorageConfig() {
        this.storageConfig = this.settings.serviceType === 's3'
            ? new S3Config(this.settings.region, this.settings.customDomain)
            : new R2Config(this.settings.customDomain);
    }

    private initializeS3Client() {
        this.s3Client = new S3Client({
            region: this.storageConfig.getRegion(),
            credentials: {
                accessKeyId: this.settings.accessKeyId,
                secretAccessKey: this.settings.secretAccessKey,
            },
            endpoint: this.storageConfig.getEndpoint(this.settings.bucket),
            forcePathStyle: false,
        });
    }

    private registerEventHandlers() {
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
                            await this.handleFileUpload(file, editor);
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
                            await this.handleFileUpload(file, editor);
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
                        await this.handleFileUpload(file, editor);
                    }
                };
                input.click();
            }
        });
    }

    private async handleFileUpload(file: File, editor: Editor) {
        try {
            const url = await this.uploadImage(file);
            editor.replaceSelection(`![](${url})`);
        } catch (error) {
            console.error('Failed to upload image:', error);
            new Notice('Failed to upload image. Please check the console for details.');
        }
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
            return this.storageConfig.getFileUrl(this.settings.bucket, key);
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.initializeStorageConfig();
        this.initializeS3Client();
    }
}

class S3ImageUploaderSettingTab extends PluginSettingTab {
    plugin: S3ImageUploader;
    tempSettings: S3ImageUploaderSettings;

    constructor(app: App, plugin: S3ImageUploader) {
        super(app, plugin);
        this.plugin = plugin;
        this.tempSettings = { ...plugin.settings };
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Object Storage Settings' });

        new Setting(containerEl)
            .setName('Service Type')
            .setDesc('Select storage service type')
            .addDropdown(dropdown => dropdown
                .addOption('s3', 'AWS S3')
                .addOption('r2', 'Cloudflare R2')
                .setValue(this.tempSettings.serviceType)
                .onChange(async (value: 's3' | 'r2') => {
                    this.tempSettings.serviceType = value;
                    if (value === 'r2') {
                        this.tempSettings.region = 'auto';
                    }
                }));

        new Setting(containerEl)
            .setName('Access Key ID')
            .setDesc('Access key ID for the storage service')
            .addText(text => text
                .setPlaceholder('Enter access key ID')
                .setValue(this.tempSettings.accessKeyId)
                .onChange(async (value) => {
                    this.tempSettings.accessKeyId = value;
                }));

        new Setting(containerEl)
            .setName('Secret Access Key')
            .setDesc('Secret access key for the storage service')
            .addText(text => text
                .setPlaceholder('Enter secret access key')
                .setValue(this.tempSettings.secretAccessKey)
                .onChange(async (value) => {
                    this.tempSettings.secretAccessKey = value;
                }));

        new Setting(containerEl)
            .setName('Region')
            .setDesc('Storage region (use "auto" for R2)')
            .addText(text => text
                .setPlaceholder('Enter region')
                .setValue(this.tempSettings.region)
                .onChange(async (value) => {
                    this.tempSettings.region = value;
                }));

        new Setting(containerEl)
            .setName('Bucket')
            .setDesc('Storage bucket name')
            .addText(text => text
                .setPlaceholder('Enter bucket name')
                .setValue(this.tempSettings.bucket)
                .onChange(async (value) => {
                    this.tempSettings.bucket = value;
                }));

        new Setting(containerEl)
            .setName('Custom Domain')
            .setDesc('Custom domain for CDN (optional)')
            .addText(text => text
                .setPlaceholder('Enter custom domain')
                .setValue(this.tempSettings.customDomain)
                .onChange(async (value) => {
                    this.tempSettings.customDomain = value;
                }));

        new Setting(containerEl)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded files')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(this.tempSettings.pathPrefix)
                .onChange(async (value) => {
                    this.tempSettings.pathPrefix = value;
                }));

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Save')
                .onClick(async () => {
                    this.plugin.settings = { ...this.tempSettings };
                    await this.plugin.saveSettings();
                    new Notice('Settings saved successfully!');
                }));
    }
} 