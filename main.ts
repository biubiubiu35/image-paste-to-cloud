import { Plugin, Editor, Notice, Setting, App, PluginSettingTab } from 'obsidian';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

interface S3ImageUploaderSettings {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    endpoint: string;
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
        this.s3Client = new S3Client({
            region: this.settings.region,
            credentials: {
                accessKeyId: this.settings.accessKeyId,
                secretAccessKey: this.settings.secretAccessKey,
            },
            endpoint: this.settings.endpoint,
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
            return `${this.settings.endpoint}/${this.settings.bucket}/${key}`;
        } catch (error) {
            // 如果文件已存在（可能是并发上传），直接返回URL
            if (error.name === 'BucketAlreadyOwnedByYou') {
                return `${this.settings.endpoint}/${this.settings.bucket}/${key}`;
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
            .setDesc('Your S3 access key ID')
            .addText(text => text
                .setPlaceholder('Enter your access key ID')
                .setValue(this.plugin.settings.accessKeyId)
                .onChange(async (value) => {
                    this.plugin.settings.accessKeyId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Secret Access Key')
            .setDesc('Your S3 secret access key')
            .addText(text => text
                .setPlaceholder('Enter your secret access key')
                .setValue(this.plugin.settings.secretAccessKey)
                .onChange(async (value) => {
                    this.plugin.settings.secretAccessKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Region')
            .setDesc('S3 region')
            .addText(text => text
                .setPlaceholder('Enter region')
                .setValue(this.plugin.settings.region)
                .onChange(async (value) => {
                    this.plugin.settings.region = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Bucket')
            .setDesc('S3 bucket name')
            .addText(text => text
                .setPlaceholder('Enter bucket name')
                .setValue(this.plugin.settings.bucket)
                .onChange(async (value) => {
                    this.plugin.settings.bucket = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Endpoint')
            .setDesc('S3 endpoint URL')
            .addText(text => text
                .setPlaceholder('Enter endpoint URL')
                .setValue(this.plugin.settings.endpoint)
                .onChange(async (value) => {
                    this.plugin.settings.endpoint = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Path Prefix')
            .setDesc('Path prefix for uploaded images')
            .addText(text => text
                .setPlaceholder('Enter path prefix')
                .setValue(this.plugin.settings.pathPrefix)
                .onChange(async (value) => {
                    this.plugin.settings.pathPrefix = value;
                    await this.plugin.saveSettings();
                }));
    }
} 