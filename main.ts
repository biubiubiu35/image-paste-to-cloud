import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

interface StorageServiceConfig {
    getEndpoint(bucket: string): string;
    getFileUrl(bucket: string, key: string): string;
    getRegion(): string;
}

class S3Config implements StorageServiceConfig {
    constructor(
        private accessKeyId: string,
        private secretAccessKey: string,
        private region: string,
        private endpoint?: string,
        private customDomain?: string
    ) {}

    getEndpoint(bucket: string): string {
        if (this.endpoint) {
            return this.endpoint;
        }
        return `https://s3.${this.region}.amazonaws.com`;
    }

    getFileUrl(bucket: string, key: string): string {
        if (this.customDomain) {
            return `https://${this.customDomain}/${key}`;
        }
        return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    getRegion(): string {
        return this.region;
    }
}

class R2Config implements StorageServiceConfig {
    constructor(
        private accessKeyId: string,
        private secretAccessKey: string,
        private endpoint: string,
        private customDomain?: string
    ) {
        if (!endpoint) {
            throw new Error('R2 endpoint is required');
        }
    }

    getEndpoint(bucket: string): string {
        return this.endpoint;
    }

    getFileUrl(bucket: string, key: string): string {
        if (this.customDomain) {
            return `https://${this.customDomain}/${key}`;
        }
        // 确保 endpoint 不以斜杠结尾，key 不以斜杠开头
        const cleanEndpoint = this.endpoint.replace(/\/+$/, '');
        const cleanKey = key.replace(/^\/+/, '');
        return `${cleanEndpoint}/${cleanKey}`;
    }

    getRegion(): string {
        return 'auto';
    }
}

interface S3ImageUploaderSettings {
    // 存储服务类型
    serviceType: 's3' | 'r2';
    // S3 配置
    s3Config: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        bucket: string;
        endpoint?: string;  // 改为可选
        customDomain: string;
        pathPrefix: string;
    };
    // R2 配置
    r2Config: {
        accessKeyId: string;
        secretAccessKey: string;
        bucket: string;
        endpoint: string;  // 保持必需
        customDomain: string;
        pathPrefix: string;
    };
}

const DEFAULT_SETTINGS: S3ImageUploaderSettings = {
    serviceType: 's3',
    s3Config: {
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1',
        bucket: '',
        endpoint: '',  // 默认为空
        customDomain: '',
        pathPrefix: 'images/'
    },
    r2Config: {
        accessKeyId: '',
        secretAccessKey: '',
        bucket: '',
        endpoint: '',  // 默认为空，但实际使用时必须提供
        customDomain: '',
        pathPrefix: 'images/'
    }
};

class FileNamingService {
    constructor(
        private settings: S3ImageUploaderSettings,
        private s3Client: S3Client
    ) {}

    async generateCloudPath(file: File): Promise<string> {
        const config = this.settings.serviceType === 's3' 
            ? this.settings.s3Config 
            : this.settings.r2Config;

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
        
        return `${config.pathPrefix}${dateStr}/${fileName}`;
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
        const { serviceType, s3Config, r2Config } = this.settings;
        
        if (serviceType === 's3') {
            this.storageConfig = new S3Config(
                s3Config.accessKeyId,
                s3Config.secretAccessKey,
                s3Config.region,
                s3Config.endpoint,
                s3Config.customDomain
            );
        } else {
            if (!r2Config.endpoint) {
                throw new Error('R2 endpoint is required');
            }
            this.storageConfig = new R2Config(
                r2Config.accessKeyId,
                r2Config.secretAccessKey,
                r2Config.endpoint,
                r2Config.customDomain
            );
        }
    }

    private initializeS3Client() {
        const config = this.settings.serviceType === 's3' 
            ? this.settings.s3Config 
            : this.settings.r2Config;

        const clientConfig: any = {
            region: this.storageConfig.getRegion(),
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            },
            endpoint: this.storageConfig.getEndpoint(config.bucket),
            forcePathStyle: true
        };

        // 如果是 R2，添加特殊配置
        if (this.settings.serviceType === 'r2') {
            clientConfig.region = 'auto';
        }

        this.s3Client = new S3Client(clientConfig);
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
        const config = this.settings.serviceType === 's3' 
            ? this.settings.s3Config 
            : this.settings.r2Config;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // 生成存储路径
        const key = await this.namingService.generateCloudPath(file);

        try {
            const command = new PutObjectCommand({
                Bucket: config.bucket,
                Key: key,
                Body: buffer,
                ContentType: file.type,
            });

            await this.s3Client.send(command);
            return this.storageConfig.getFileUrl(config.bucket, key);
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
    private settingsContainer: HTMLElement;

    constructor(app: App, plugin: S3ImageUploader) {
        super(app, plugin);
        this.plugin = plugin;
        this.tempSettings = { ...plugin.settings };
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Object Storage Settings' });

        // 创建服务类型选择器
        new Setting(containerEl)
            .setName('Service Type')
            .setDesc('Select storage service type')
            .addDropdown(dropdown => dropdown
                .addOption('s3', 'AWS S3')
                .addOption('r2', 'Cloudflare R2')
                .setValue(this.tempSettings.serviceType)
                .onChange(async (value: 's3' | 'r2') => {
                    this.tempSettings.serviceType = value;
                    this.renderSettings();
                }));

        // 创建设置容器
        this.settingsContainer = containerEl.createDiv('settings-container');
        this.renderSettings();
    }

    private renderSettings() {
        // 清空设置容器
        this.settingsContainer.empty();

        // 创建服务特定的说明
        const serviceDesc = this.settingsContainer.createDiv('service-description');
        if (this.tempSettings.serviceType === 's3') {
            serviceDesc.createEl('p', { text: 'AWS S3 Configuration' });
            serviceDesc.createEl('p', { 
                text: 'For AWS S3, you can use CloudFront or other CDN services for acceleration.',
                cls: 'setting-item-description'
            });
            this.renderS3Settings();
        } else {
            serviceDesc.createEl('p', { text: 'Cloudflare R2 Configuration' });
            serviceDesc.createEl('p', { 
                text: 'For R2, you can use Cloudflare\'s built-in CDN capabilities.',
                cls: 'setting-item-description'
            });
            this.renderR2Settings();
        }

        // 创建保存按钮
        this.createSaveButton();
    }

    private renderS3Settings() {
        const config = this.tempSettings.s3Config;

        // Access Key ID
        new Setting(this.settingsContainer)
            .setName('Access Key ID')
            .setDesc('AWS S3 access key ID')
            .addText(text => text
                .setPlaceholder('Enter AWS access key ID')
                .setValue(config.accessKeyId)
                .onChange(async (value) => {
                    config.accessKeyId = value;
                }));

        // Secret Access Key
        new Setting(this.settingsContainer)
            .setName('Secret Access Key')
            .setDesc('AWS S3 secret access key')
            .addText(text => text
                .setPlaceholder('Enter AWS secret access key')
                .setValue(config.secretAccessKey)
                .onChange(async (value) => {
                    config.secretAccessKey = value;
                }));

        // Region
        new Setting(this.settingsContainer)
            .setName('Region')
            .setDesc('AWS region (e.g., us-east-1, ap-northeast-1)')
            .addText(text => text
                .setPlaceholder('Enter AWS region')
                .setValue(config.region)
                .onChange(async (value) => {
                    config.region = value;
                }));

        // Bucket
        new Setting(this.settingsContainer)
            .setName('Bucket')
            .setDesc('S3 bucket name')
            .addText(text => text
                .setPlaceholder('Enter S3 bucket name')
                .setValue(config.bucket)
                .onChange(async (value) => {
                    config.bucket = value;
                }));

        // Custom Domain
        new Setting(this.settingsContainer)
            .setName('Custom Domain')
            .setDesc('Custom domain for CDN (e.g., cdn.example.com)')
            .addText(text => text
                .setPlaceholder('Enter custom domain')
                .setValue(config.customDomain)
                .onChange(async (value) => {
                    config.customDomain = value;
                }));

        // Path Prefix
        new Setting(this.settingsContainer)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded files (e.g., images/)')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(config.pathPrefix)
                .onChange(async (value) => {
                    config.pathPrefix = value;
                }));

        // Endpoint
        new Setting(this.settingsContainer)
            .setName('Endpoint')
            .setDesc('S3 endpoint URL (optional)')
            .addText(text => text
                .setPlaceholder('https://s3.amazonaws.com')
                .setValue(config.endpoint || '')
                .onChange(async (value) => {
                    config.endpoint = value;
                }));
    }

    private renderR2Settings() {
        const config = this.tempSettings.r2Config;

        // Access Key ID
        new Setting(this.settingsContainer)
            .setName('Access Key ID')
            .setDesc('R2 access key ID')
            .addText(text => text
                .setPlaceholder('Enter R2 access key ID')
                .setValue(config.accessKeyId)
                .onChange(async (value) => {
                    config.accessKeyId = value;
                }));

        // Secret Access Key
        new Setting(this.settingsContainer)
            .setName('Secret Access Key')
            .setDesc('R2 secret access key')
            .addText(text => text
                .setPlaceholder('Enter R2 secret access key')
                .setValue(config.secretAccessKey)
                .onChange(async (value) => {
                    config.secretAccessKey = value;
                }));

        // Bucket
        new Setting(this.settingsContainer)
            .setName('Bucket')
            .setDesc('R2 bucket name')
            .addText(text => text
                .setPlaceholder('Enter R2 bucket name')
                .setValue(config.bucket)
                .onChange(async (value) => {
                    config.bucket = value;
                }));

        // Custom Domain
        new Setting(this.settingsContainer)
            .setName('Custom Domain')
            .setDesc('Custom domain for R2 (e.g., r2.example.com)')
            .addText(text => text
                .setPlaceholder('Enter custom domain')
                .setValue(config.customDomain)
                .onChange(async (value) => {
                    config.customDomain = value;
                }));

        // Path Prefix
        new Setting(this.settingsContainer)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded files (e.g., images/)')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(config.pathPrefix)
                .onChange(async (value) => {
                    config.pathPrefix = value;
                }));

        // Endpoint
        new Setting(this.settingsContainer)
            .setName('Endpoint')
            .setDesc('R2 endpoint URL (required)')
            .addText(text => text
                .setPlaceholder('https://{accountId}.r2.cloudflarestorage.com')
                .setValue(config.endpoint)
                .onChange(async (value) => {
                    config.endpoint = value;
                }));
    }

    private createSaveButton() {
        new Setting(this.settingsContainer)
            .addButton(button => button
                .setButtonText('Save Settings')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings = { ...this.tempSettings };
                    await this.plugin.saveSettings();
                    new Notice('Settings saved successfully!');
                }));
    }
} 