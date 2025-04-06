import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

const PLUGIN_NAME = 'Image Paste to Cloud';

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
    private baseEndpoint: string;
    private bucketFromEndpoint: string | null = null;

    constructor(
        private accessKeyId: string,
        private secretAccessKey: string,
        private endpoint: string,
        private customDomain?: string
    ) {
        if (!endpoint) {
            throw new Error('R2 endpoint is required');
        }

        // 解析 endpoint URL
        try {
            const url = new URL(endpoint);
            if (!url.protocol.startsWith('http')) {
                throw new Error('Endpoint must start with http:// or https://');
            }
            // 移除路径中的 bucket 名称
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
                this.bucketFromEndpoint = pathParts[0];
            }
            // 构建基础 endpoint
            url.pathname = '';
            this.baseEndpoint = url.toString().replace(/\/$/, '');
        } catch (e) {
            throw new Error(`Invalid R2 endpoint URL: ${e.message}`);
        }
    }

    getEndpoint(bucket: string): string {
        return this.baseEndpoint;
    }

    getFileUrl(bucket: string, key: string): string {
        if (this.customDomain) {
            return `https://${this.customDomain}/${key}`;
        }
        // 使用从 endpoint 中提取的 bucket 名称，如果存在的话
        const actualBucket = this.bucketFromEndpoint || bucket;
        return `${this.baseEndpoint}/${actualBucket}/${key}`;
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
        
        try {
            this.initializeStorageConfig();
            this.initializeS3Client();
            await this.validateConfig();
        } catch (error) {
            // 只显示提示信息，不阻止插件启动
            new Notice(`${PLUGIN_NAME} - Please configure the plugin settings: ${error.message}`, 8000);
            console.error(`${PLUGIN_NAME} - Configuration error:`, error);
        }

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
            forcePathStyle: true  // 对 R2 和 S3 都使用 path style
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
            console.error(`${PLUGIN_NAME} - Upload failed:`, error);
            let message = `${PLUGIN_NAME} - Upload failed`;
            
            const config = this.settings.serviceType === 's3' ? this.settings.s3Config : this.settings.r2Config;
            const endpoint = this.storageConfig.getEndpoint(config.bucket);
            
            // 从 S3 错误中提取更多信息
            const s3Error = error as any;
            const statusCode = s3Error.$metadata?.httpStatusCode || 'unknown';
            const requestId = s3Error.$metadata?.requestId || '';
            const errorCode = s3Error.Code || s3Error.name || 'UnknownError';
            const errorDetail = s3Error.Message || s3Error.message || 'Unknown error occurred';
            
            if (errorCode === 'NoSuchBucket') {
                message = `${PLUGIN_NAME} - Bucket not found when accessing ${endpoint}\nBucket: "${config.bucket}"\nRequest ID: ${requestId}`;
            } else if (errorCode === 'AccessDenied') {
                message = `${PLUGIN_NAME} - Access denied when accessing ${endpoint}\nPlease check your credentials and bucket permissions\nRequest ID: ${requestId}`;
            } else if (errorCode === 'NetworkError' || errorCode?.includes('Network')) {
                message = `${PLUGIN_NAME} - Network error when accessing ${endpoint}\nPlease check your internet connection and endpoint configuration\nRequest ID: ${requestId}`;
            } else if (errorDetail.includes('CORS')) {
                message = `${PLUGIN_NAME} - CORS error when accessing ${endpoint}\nPlease check your bucket CORS settings\nRequest ID: ${requestId}`;
            } else {
                message = `${PLUGIN_NAME} - Error when accessing ${endpoint}\nError: ${errorDetail}\nRequest ID: ${requestId}`;
            }
            
            new Notice(message, 8000);
        }
    }

    async uploadImage(file: File): Promise<string> {
        const config = this.settings.serviceType === 's3' 
            ? this.settings.s3Config 
            : this.settings.r2Config;

        try {
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
                
                // 验证上传是否成功
                try {
                    const headCommand = new HeadObjectCommand({
                        Bucket: config.bucket,
                        Key: key
                    });
                    await this.s3Client.send(headCommand);
                } catch (error) {
                    throw new Error(`File uploaded but not accessible (HTTP ${error.$metadata?.httpStatusCode || 'unknown'}): ${error.message}`);
                }

                return this.storageConfig.getFileUrl(config.bucket, key);
            } catch (error) {
                if (error.name === 'NoSuchBucket') {
                    throw error;
                }
                if (error.name === 'AccessDenied') {
                    throw error;
                }
                if (error.name?.includes('Network')) {
                    error.name = 'NetworkError';
                    throw error;
                }
                if (error.$metadata?.httpStatusCode) {
                    throw new Error(`HTTP ${error.$metadata.httpStatusCode}: ${error.message}`);
                }
                throw error;
            }
        } catch (error) {
            console.error(`${PLUGIN_NAME} - Upload failed:`, error);
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

    private async validateConfig() {
        const config = this.settings.serviceType === 's3' 
            ? this.settings.s3Config 
            : this.settings.r2Config;

        // 验证必填字段
        const requiredFields = ['accessKeyId', 'secretAccessKey', 'bucket'] as const;
        const missingFields = requiredFields.filter(field => !config[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // 验证路径前缀格式
        if (!config.pathPrefix.endsWith('/')) {
            throw new Error('Path prefix must end with /');
        }

        // 验证自定义域名格式
        if (config.customDomain && !this.isValidDomain(config.customDomain)) {
            throw new Error('Invalid custom domain format');
        }

        // 验证存储桶连接
        try {
            const command = new HeadObjectCommand({
                Bucket: config.bucket,
                Key: '.obsidian-test-connection'
            });
            await this.s3Client.send(command);
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                // 这是正常的，说明可以连接到存储桶
                return;
            }
            if (error.name === 'NoSuchBucket') {
                throw new Error(`Bucket "${config.bucket}" not found. Please check your configuration.`);
            }
            if (error.name === 'AccessDenied') {
                throw new Error('Access denied. Please check your credentials and bucket permissions.');
            }
            throw new Error(`Failed to connect to storage: ${error.message}`);
        }
    }

    private isValidDomain(domain: string): boolean {
        return /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/.test(domain);
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
            .setDesc('Your AWS access key ID from IAM user credentials')
            .addText(text => text
                .setPlaceholder('AKIAXXXXXXXXXXXXXXXX')
                .setValue(config.accessKeyId)
                .onChange(async (value) => {
                    config.accessKeyId = value;
                }));

        // Secret Access Key
        new Setting(this.settingsContainer)
            .setName('Secret Access Key')
            .setDesc('Your AWS secret access key from IAM user credentials')
            .addText(text => text
                .setPlaceholder('Enter your secret access key')
                .setValue(config.secretAccessKey)
                .onChange(async (value) => {
                    config.secretAccessKey = value;
                }));

        // Region
        new Setting(this.settingsContainer)
            .setName('Region')
            .setDesc('AWS region where your bucket is located (e.g., us-east-1)')
            .addText(text => text
                .setPlaceholder('us-east-1')
                .setValue(config.region)
                .onChange(async (value) => {
                    config.region = value;
                }));

        // Bucket
        new Setting(this.settingsContainer)
            .setName('Bucket')
            .setDesc('Name of your S3 bucket')
            .addText(text => text
                .setPlaceholder('my-image-bucket')
                .setValue(config.bucket)
                .onChange(async (value) => {
                    config.bucket = value;
                }));

        // Custom Domain
        new Setting(this.settingsContainer)
            .setName('Custom Domain')
            .setDesc('Optional: Your CloudFront or custom CDN domain (without https://)')
            .addText(text => text
                .setPlaceholder('images.yourdomain.com')
                .setValue(config.customDomain)
                .onChange(async (value) => {
                    config.customDomain = value;
                }));

        // Path Prefix
        new Setting(this.settingsContainer)
            .setName('Path Prefix')
            .setDesc('Prefix for uploaded files (e.g., images/). Must end with /')
            .addText(text => text
                .setPlaceholder('images/')
                .setValue(config.pathPrefix)
                .onChange(async (value) => {
                    config.pathPrefix = value;
                }));

        // Endpoint
        new Setting(this.settingsContainer)
            .setName('Endpoint')
            .setDesc('Optional: Custom S3-compatible endpoint URL (for non-AWS services)')
            .addText(text => text
                .setPlaceholder('https://s3.custom-provider.com')
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
            .setDesc('Your R2 access key ID from API token')
            .addText(text => text
                .setPlaceholder('Enter your R2 access key ID')
                .setValue(config.accessKeyId)
                .onChange(async (value) => {
                    config.accessKeyId = value;
                }));

        // Secret Access Key
        new Setting(this.settingsContainer)
            .setName('Secret Access Key')
            .setDesc('Your R2 secret access key from API token')
            .addText(text => text
                .setPlaceholder('Enter your R2 secret access key')
                .setValue(config.secretAccessKey)
                .onChange(async (value) => {
                    config.secretAccessKey = value;
                }));

        // Bucket
        new Setting(this.settingsContainer)
            .setName('Bucket')
            .setDesc('Name of your R2 bucket')
            .addText(text => text
                .setPlaceholder('my-image-bucket')
                .setValue(config.bucket)
                .onChange(async (value) => {
                    config.bucket = value;
                }));

        // Custom Domain
        new Setting(this.settingsContainer)
            .setName('Custom Domain')
            .setDesc('Optional: Your custom domain for R2 (without https://)')
            .addText(text => text
                .setPlaceholder('images.yourdomain.com')
                .setValue(config.customDomain)
                .onChange(async (value) => {
                    config.customDomain = value;
                }));

        // Path Prefix
        new Setting(this.settingsContainer)
            .setName('Path Prefix')
            .setDesc('Prefix for uploaded files (e.g., images/). Must end with /')
            .addText(text => text
                .setPlaceholder('images/')
                .setValue(config.pathPrefix)
                .onChange(async (value) => {
                    config.pathPrefix = value;
                }));

        // Endpoint
        new Setting(this.settingsContainer)
            .setName('S3 API Endpoint')
            .setDesc('Copy the complete S3 API endpoint URL from your R2 bucket settings')
            .addText(text => text
                .setPlaceholder('https://<id>.r2.cloudflarestorage.com/bucket-name')
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