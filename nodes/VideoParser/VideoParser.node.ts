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

import {
	assertSafeMediaUrl,
	parseVideo,
	resolveVideoMimeType,
	SelectablePlatform,
} from './videoParserUtils';
import { downloadCandidates } from './mediaTransfer';
import { buildXiaohongshuCandidates } from './xiaohongshuDownload';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

function fileExtension(mimeType: string): string {
	const extensions: Record<string, string> = {
		'video/mp4': 'mp4',
		'video/webm': 'webm',
		'video/quicktime': 'mov',
		'video/x-m4v': 'm4v',
	};
	return extensions[mimeType] || 'mp4';
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

	const contentType = response.headers['content-type'];
	const contentDisposition = response.headers['content-disposition'];
	let mimeType: string;
	try {
		mimeType = resolveVideoMimeType(
			typeof contentType === 'string' ? contentType : undefined,
			typeof contentDisposition === 'string' ? contentDisposition : undefined,
			url,
		);
	} catch (error) {
		response.data.destroy();
		throw error;
	}
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
		description: '解析和下载抖音、TikTok、小红书等平台的公开视频',
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
					'公开视频链接，支持抖音、TikTok、Instagram Reels、Facebook、X、YouTube、快手和小红书',
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
						name: 'Instagram Reels',
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
				description: '选择视频平台；自动检测会根据 URL 域名识别',
			},
			{
				displayName: '自动下载视频',
				name: 'downloadVideo',
				type: 'boolean',
				default: false,
				description: '是否以流式方式下载视频并输出为二进制数据；单个文件上限为 250 MiB',
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

				const { platform, normalized, rawData, requestContext } = await parseVideo(
					videoUrl.trim(),
					selectedPlatform,
				);
				const outputData: INodeExecutionData = {
					pairedItem: { item: i },
					json: {
						platform,
						contentType: normalized.contentType,
						title: normalized.title,
						author: normalized.author,
						videoUrl: normalized.videoUrl,
						audioUrl: normalized.audioUrl,
						coverUrl: normalized.coverUrl,
						duration: normalized.duration,
						description: normalized.description,
						keywords: normalized.keywords,
						tags: normalized.tags,
						stats: { ...normalized.stats },
						links: normalized.links.map((link) => ({ ...link })),
						downloads: normalized.downloads,
						rawData: rawData as IDataObject,
					},
				};

				if (shouldDownload && normalized.videoUrl) {
					if (platform === 'douyin' || platform === 'xiaohongshu') {
						const candidates =
							platform === 'xiaohongshu'
								? buildXiaohongshuCandidates(normalized.videoUrl)
								: normalized.links.map(({ url }) => ({ url, source: 'official' as const }));
						const result = await downloadCandidates(this, candidates, requestContext);
						outputData.binary = { data: result.binary };
						outputData.json.videoUrl = result.usedUrl;
					} else {
						outputData.binary = { data: await downloadBinary(this, normalized.videoUrl, 'video') };
					}
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
