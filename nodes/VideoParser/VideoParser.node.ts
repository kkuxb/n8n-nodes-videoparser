import { Readable, Transform } from 'stream';

import axios from 'axios';
import {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { assertSafeMediaUrl, parseVideo, SelectablePlatform } from './videoParserUtils';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

function fileExtension(mimeType: string): string {
	const extensions: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp',
		'image/gif': 'gif',
		'video/mp4': 'mp4',
		'video/webm': 'webm',
	};
	return extensions[mimeType] || (mimeType.startsWith('image/') ? 'jpg' : 'mp4');
}

function limitStream(source: Readable, maxBytes: number): Readable {
	let receivedBytes = 0;
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			receivedBytes += chunk.length;
			if (receivedBytes > maxBytes) {
				callback(new Error(`媒体文件超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 下载上限`));
				return;
			}
			callback(null, chunk);
		},
	});
	return source.pipe(limiter);
}

async function downloadBinary(
	context: IExecuteFunctions,
	url: string,
	filePrefix: string,
	fallbackMimeType: string,
): Promise<IBinaryData> {
	assertSafeMediaUrl(url);

	const response = await axios.get<Readable>(url, {
		responseType: 'stream',
		timeout: DOWNLOAD_TIMEOUT_MS,
		maxRedirects: 5,
		maxContentLength: MAX_DOWNLOAD_BYTES,
		beforeRedirect: (options) => {
			const protocol = options.protocol || 'https:';
			const hostname = options.hostname || options.host;
			if (hostname) assertSafeMediaUrl(`${protocol}//${hostname}`);
		},
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
		},
	});

	const contentLength = Number(response.headers['content-length'] || 0);
	if (contentLength > MAX_DOWNLOAD_BYTES) {
		response.data.destroy();
		throw new Error(`媒体文件超过 ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)} MiB 下载上限`);
	}

	const mimeType = String(response.headers['content-type'] || fallbackMimeType)
		.split(';')[0]
		.trim();
	const fileName = `${filePrefix}_${Date.now()}.${fileExtension(mimeType)}`;
	return context.helpers.prepareBinaryData(
		limitStream(response.data, MAX_DOWNLOAD_BYTES),
		fileName,
		mimeType,
	);
}

export class VideoParser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Video Parser',
		name: 'videoParser',
		icon: 'file:videoparser.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["platform"]}}',
		description: '解析和下载抖音、TikTok、小红书等平台的公开媒体',
		defaults: {
			name: 'Video Parser',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: '视频链接',
				name: 'videoUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://v.douyin.com/xxxxx/',
				description:
					'公开媒体链接，支持抖音、TikTok、Instagram、Facebook、X、YouTube、快手和小红书',
			},
			{
				displayName: '平台',
				name: 'platform',
				type: 'options',
				options: [
					{
						name: '自动检测',
						value: 'auto',
					},
					{
						name: '抖音 (Douyin)',
						value: 'douyin',
					},
					{
						name: 'TikTok',
						value: 'tiktok',
					},
					{
						name: 'Instagram',
						value: 'instagram',
					},
					{
						name: 'Facebook',
						value: 'facebook',
					},
					{
						name: 'Twitter/X',
						value: 'twitter',
					},
					{
						name: 'YouTube',
						value: 'youtube',
					},
					{
						name: 'Kuaishou',
						value: 'kuaishou',
					},
					{
						name: 'Xiaohongshu',
						value: 'xiaohongshu',
					},
				],
				default: 'auto',
				description: '选择媒体平台；自动检测会根据 URL 域名识别',
			},
			{
				displayName: '自动下载视频',
				name: 'downloadVideo',
				type: 'boolean',
				default: false,
				description: '是否以流式方式下载媒体并输出为二进制数据；单个文件上限为 250 MiB',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const videoUrl = this.getNodeParameter('videoUrl', i) as string;
				const selectedPlatform = this.getNodeParameter('platform', i) as
					| SelectablePlatform
					| 'auto';
				const shouldDownload = this.getNodeParameter('downloadVideo', i) as boolean;

				if (!videoUrl.trim()) {
					throw new NodeOperationError(this.getNode(), '视频链接不能为空', { itemIndex: i });
				}

				const { platform, normalized, rawData } = await parseVideo(
					videoUrl.trim(),
					selectedPlatform,
				);
				const outputData: INodeExecutionData = {
					json: {
						platform,
						contentType: normalized.contentType,
						title: normalized.title,
						author: normalized.author,
						videoUrl: normalized.videoUrl,
						audioUrl: normalized.audioUrl,
						imageUrl: normalized.imageUrl,
						coverUrl: normalized.coverUrl,
						duration: normalized.duration,
						description: normalized.description,
						keywords: normalized.keywords,
						tags: normalized.tags,
						stats: { ...normalized.stats },
						links: normalized.links.map((link) => ({ ...link })),
						downloads: normalized.downloads,
						images: normalized.images,
						rawData: rawData as IDataObject,
					},
				};

				if (shouldDownload && normalized.videoUrl) {
					outputData.binary = {
						data: await downloadBinary(this, normalized.videoUrl, 'video', 'video/mp4'),
					};
				} else if (shouldDownload && normalized.images.length > 0) {
					const binaryImages: Record<string, IBinaryData> = {};
					for (let imageIndex = 0; imageIndex < normalized.images.length; imageIndex++) {
						binaryImages[`image${imageIndex + 1}`] = await downloadBinary(
							this,
							normalized.images[imageIndex],
							`image_${imageIndex + 1}`,
							'image/jpeg',
						);
					}
					outputData.binary = binaryImages;
				}

				returnData.push(outputData);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: errorMessage },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), errorMessage, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
