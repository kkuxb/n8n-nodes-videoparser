import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import axios from 'axios';

// Import btch-downloader functions
const btchDownloader = require('btch-downloader');

export class VideoParser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Video Parser',
		name: 'videoParser',
		icon: 'file:videoparser.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: '解析和下载抖音、快手、B站等视频平台的视频',
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
				description: '视频分享链接（支持抖音、快手、B站、TikTok等平台）',
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
						name: 'Bilibili',
						value: 'bilibili',
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
				description: '选择视频平台（自动检测会根据URL自动识别）',
			},
			{
				displayName: '自动下载视频',
				name: 'downloadVideo',
				type: 'boolean',
				default: false,
				description: '是否自动下载视频文件（下载后作为二进制数据输出）',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const videoUrl = this.getNodeParameter('videoUrl', i) as string;
				const platform = this.getNodeParameter('platform', i) as string;
				const downloadVideo = this.getNodeParameter('downloadVideo', i) as boolean;

				if (!videoUrl) {
					throw new NodeOperationError(this.getNode(), '视频链接不能为空', { itemIndex: i });
				}

				// Parse video based on platform
				let videoInfo: any;

				if (platform === 'auto') {
					// Auto-detect platform from URL
					videoInfo = await detectAndParse(videoUrl);
				} else {
					// Use specified platform
					videoInfo = await parseByPlatform(videoUrl, platform);
				}

				if (!videoInfo) {
					throw new NodeOperationError(
						this.getNode(),
						`无法解析视频链接: ${videoUrl}`,
						{ itemIndex: i },
					);
				}

				// Extract data from btch-downloader response structure
				const data = videoInfo?.result?.data || videoInfo?.result || videoInfo?.data || videoInfo;
				const links = data?.links || [];
				const downloads = data?.downloads || [];
				const images = data?.images || [];

				// Determine content type and URL
				let extractedVideoUrl = '';
				let contentType = 'video';

				if (links.length > 0) {
					// Standard video platforms (Douyin, TikTok, etc.)
					extractedVideoUrl = links[0].url;
				} else if (downloads.length > 0) {
					// Xiaohongshu video format
					extractedVideoUrl = downloads[0];
				} else if (images.length > 0) {
					// Xiaohongshu image content
					contentType = 'image';
					extractedVideoUrl = images[0];
				}

				// Extract engagement stats (Xiaohongshu format)
				const engagement = data?.engagement || {};
				const likes = engagement?.likes || data?.likes || data?.like_count || data?.digg_count || 0;
				const comments = engagement?.comments || data?.comments || data?.comment_count || 0;
				const collects = engagement?.collects || data?.collects || 0;

				// Prepare output data
				const outputData: INodeExecutionData = {
					json: {
						platform: platform,
						contentType: contentType,
						title: data?.title || data?.nickname || '',
						author: data?.author || data?.username || data?.nickname || '',
						videoUrl: contentType === 'video' ? extractedVideoUrl : '',
						imageUrl: contentType === 'image' ? extractedVideoUrl : '',
						coverUrl: data?.thumbnail || data?.cover_url || data?.coverUrl || '',
						duration: data?.duration || 0,
						description: data?.description || data?.caption || data?.desc || '',
						keywords: data?.keywords || '',
						tags: data?.tags || data?.hashtags || [],
						stats: {
							likes: typeof likes === 'string' ? parseInt(likes) || 0 : likes,
							comments: typeof comments === 'string' ? parseInt(comments) || 0 : comments,
							shares: data?.shares || data?.share_count || 0,
							views: data?.views || data?.view_count || data?.play_count || 0,
							collects: typeof collects === 'string' ? parseInt(collects) || 0 : collects,
						},
						links: links,
						downloads: downloads,
						images: images,
						rawData: videoInfo,
					},
				};

				// Download video if requested
				if (downloadVideo && outputData.json.videoUrl) {
					try {
						const videoResponse = await axios.get(outputData.json.videoUrl as string, {
							responseType: 'arraybuffer',
							timeout: 60000, // 60 seconds timeout
						});

						const binaryData = await this.helpers.prepareBinaryData(
							Buffer.from(videoResponse.data),
							`video_${Date.now()}.mp4`,
							'video/mp4',
						);

						outputData.binary = {
							data: binaryData,
						};
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						throw new NodeOperationError(
							this.getNode(),
							`视频下载失败: ${errorMessage}`,
							{ itemIndex: i },
						);
					}
				} else if (downloadVideo && outputData.json.imageUrl) {
					// Download image for image-based content (e.g., Xiaohongshu)
					try {
						const imageResponse = await axios.get(outputData.json.imageUrl as string, {
							responseType: 'arraybuffer',
							timeout: 60000,
						});

						const binaryData = await this.helpers.prepareBinaryData(
							Buffer.from(imageResponse.data),
							`image_${Date.now()}.jpg`,
							'image/jpeg',
						);

						outputData.binary = {
							data: binaryData,
						};
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						throw new NodeOperationError(
							this.getNode(),
							`图片下载失败: ${errorMessage}`,
							{ itemIndex: i },
						);
					}
				}

				returnData.push(outputData);
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: {
							error: errorMessage,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}

}

async function detectAndParse(url: string): Promise<any> {
		// Try to detect platform from URL
		if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
			return await btchDownloader.douyin(url);
		} else if (url.includes('tiktok.com')) {
			return await btchDownloader.tiktok(url);
		} else if (url.includes('instagram.com')) {
			return await btchDownloader.instagram(url);
		} else if (url.includes('facebook.com') || url.includes('fb.watch')) {
			return await btchDownloader.facebook(url);
		} else if (url.includes('twitter.com') || url.includes('x.com')) {
			return await btchDownloader.twitter(url);
		} else if (url.includes('youtube.com') || url.includes('youtu.be')) {
			return await btchDownloader.youtube(url);
		} else if (url.includes('bilibili.com')) {
			return await btchDownloader.bilibili(url);
		} else if (url.includes('kuaishou.com')) {
			return await btchDownloader.kuaishou(url);
		} else if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) {
			return await btchDownloader.xiaohongshu(url);
		}

		throw new Error('无法识别视频平台，请手动选择平台');
	}

async function parseByPlatform(url: string, platform: string): Promise<any> {
		const platformMap: { [key: string]: any } = {
			douyin: btchDownloader.douyin,
			tiktok: btchDownloader.tiktok,
			instagram: btchDownloader.instagram,
			facebook: btchDownloader.facebook,
			twitter: btchDownloader.twitter,
			youtube: btchDownloader.youtube,
			bilibili: btchDownloader.bilibili,
			kuaishou: btchDownloader.kuaishou,
			xiaohongshu: btchDownloader.xiaohongshu,
		};

		const parserFunc = platformMap[platform];
		if (!parserFunc) {
			throw new Error(`不支持的平台: ${platform}`);
		}

		return await parserFunc(url);
}
