import * as btchDownloader from 'btch-downloader';

export type DownloadPlatform =
	| 'douyin'
	| 'tiktok'
	| 'instagram'
	| 'facebook'
	| 'twitter'
	| 'youtube'
	| 'kuaishou'
	| 'xiaohongshu';

export type SelectablePlatform = DownloadPlatform;

export interface MediaLink {
	quality: string;
	url: string;
}

export interface NormalizedVideoInfo {
	contentType: 'video' | 'image';
	title: string;
	author: string;
	videoUrl: string;
	audioUrl: string;
	imageUrl: string;
	coverUrl: string;
	duration: number;
	description: string;
	keywords: string;
	tags: string[];
	stats: {
		likes: number;
		comments: number;
		shares: number;
		views: number;
		collects: number;
	};
	links: MediaLink[];
	downloads: string[];
	images: string[];
}

type UnknownRecord = Record<string, unknown>;
type ParserFunction = (url: string) => Promise<unknown>;

const EMPTY_MEDIA_ERROR = '上游解析成功，但没有返回可下载的媒体地址';

const PARSER_FUNCTION_NAMES: Record<DownloadPlatform, string> = {
	douyin: 'douyin',
	tiktok: 'ttdl',
	instagram: 'igdl',
	facebook: 'fbdown',
	twitter: 'twitter',
	youtube: 'youtube',
	kuaishou: 'kuaishou',
	xiaohongshu: 'xiaohongshu',
};

const PARSER_FUNCTIONS: Record<DownloadPlatform, ParserFunction> = {
	douyin: btchDownloader.douyin,
	tiktok: btchDownloader.ttdl,
	instagram: btchDownloader.igdl,
	facebook: btchDownloader.fbdown,
	twitter: btchDownloader.twitter,
	youtube: btchDownloader.youtube,
	kuaishou: btchDownloader.kuaishou,
	xiaohongshu: btchDownloader.xiaohongshu,
};

function asRecord(value: unknown): UnknownRecord | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as UnknownRecord)
		: undefined;
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value.replace(/,/g, ''));
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function firstString(value: unknown): string {
	if (typeof value === 'string') return value;
	return asStringArray(value)[0] || '';
}

function getResultData(rawData: unknown): unknown {
	const root = asRecord(rawData);
	if (!root) return rawData;

	const result = root.result;
	const resultRecord = asRecord(result);
	if (resultRecord && resultRecord.data !== undefined) return resultRecord.data;
	if (result !== undefined) return result;
	if (root.data !== undefined) return root.data;
	return root;
}

function getErrorMessage(rawData: unknown): string {
	const root = asRecord(rawData);
	const result = asRecord(root?.result);
	const data = asRecord(result?.data);
	return (
		asString(root?.message) ||
		asString(result?.message) ||
		asString(data?.message) ||
		'上游解析服务未返回可用结果'
	);
}

function assertParserSuccess(rawData: unknown): void {
	const root = asRecord(rawData);
	const result = asRecord(root?.result);
	const data = asRecord(result?.data);
	if (
		root?.status === false ||
		result?.status === false ||
		result?.success === false ||
		data?.status === false ||
		data?.success === false
	) {
		throw new Error(getErrorMessage(rawData));
	}
}

function mediaLinks(value: unknown, defaultQuality = 'Default'): MediaLink[] {
	if (typeof value === 'string') {
		return value ? [{ quality: defaultQuality, url: value }] : [];
	}
	if (!Array.isArray(value)) return [];

	return value.flatMap((item, index) => {
		if (typeof item === 'string') {
			return item ? [{ quality: `${defaultQuality} ${index + 1}`, url: item }] : [];
		}

		const record = asRecord(item);
		const url = asString(record?.url);
		if (!url) return [];
		return [
			{
				quality: asString(record?.quality) || `${defaultQuality} ${index + 1}`,
				url,
			},
		];
	});
}

function qualityObjectLinks(value: unknown): MediaLink[] {
	if (typeof value === 'string') return [{ quality: 'Default', url: value }];
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		const record = asRecord(item);
		if (!record) return [];
		return Object.entries(record).flatMap(([quality, url]) =>
			typeof url === 'string' && url ? [{ quality: quality.toUpperCase(), url }] : [],
		);
	});
}

function baseNormalized(): NormalizedVideoInfo {
	return {
		contentType: 'video',
		title: '',
		author: '',
		videoUrl: '',
		audioUrl: '',
		imageUrl: '',
		coverUrl: '',
		duration: 0,
		description: '',
		keywords: '',
		tags: [],
		stats: {
			likes: 0,
			comments: 0,
			shares: 0,
			views: 0,
			collects: 0,
		},
		links: [],
		downloads: [],
		images: [],
	};
}

function normalizeDouyin(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(getResultData(rawData));
	const links = mediaLinks(data?.links, 'Video');
	return {
		...baseNormalized(),
		title: asString(data?.title),
		coverUrl: asString(data?.thumbnail),
		videoUrl: links[0]?.url || '',
		links,
	};
}

function normalizeTikTok(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(rawData);
	const links = mediaLinks(data?.video, 'Video');
	return {
		...baseNormalized(),
		title: asString(data?.title),
		coverUrl: asString(data?.thumbnail),
		videoUrl: links[0]?.url || '',
		audioUrl: firstString(data?.audio),
		links,
	};
}

function normalizeInstagram(rawData: unknown): NormalizedVideoInfo {
	const root = asRecord(rawData);
	const items = Array.isArray(root?.result) ? root.result : [];
	const links = items.flatMap((item, index) => {
		const record = asRecord(item);
		const url = asString(record?.url);
		return url ? [{ quality: `Media ${index + 1}`, url }] : [];
	});
	const firstItem = asRecord(items[0]);
	return {
		...baseNormalized(),
		coverUrl: asString(firstItem?.thumbnail),
		videoUrl: links[0]?.url || '',
		links,
	};
}

function normalizeFacebook(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(rawData);
	const links: MediaLink[] = [];
	const hd = asString(data?.HD);
	const normal = asString(data?.Normal_video);
	if (hd) links.push({ quality: 'HD', url: hd });
	if (normal && normal !== hd) links.push({ quality: 'Normal', url: normal });
	return {
		...baseNormalized(),
		videoUrl: links[0]?.url || '',
		links,
	};
}

function normalizeTwitter(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(rawData);
	const links = qualityObjectLinks(data?.url);
	return {
		...baseNormalized(),
		title: asString(data?.title),
		videoUrl: links[0]?.url || '',
		links,
	};
}

function normalizeYouTube(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(rawData);
	const videoUrl = asString(data?.mp4);
	return {
		...baseNormalized(),
		title: asString(data?.title),
		author: asString(data?.author),
		coverUrl: asString(data?.thumbnail),
		videoUrl,
		audioUrl: asString(data?.mp3),
		links: videoUrl ? [{ quality: 'MP4', url: videoUrl }] : [],
	};
}

function normalizeKuaishou(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(getResultData(rawData));
	const videoUrl = asString(data?.videoUrl);
	return {
		...baseNormalized(),
		title: asString(data?.title),
		author: asString(data?.author) || asString(data?.username),
		videoUrl,
		duration: asNumber(data?.duration),
		stats: {
			likes: asNumber(data?.likeCount),
			comments: asNumber(data?.commentCount),
			shares: 0,
			views: asNumber(data?.viewCount),
			collects: 0,
		},
		links: videoUrl ? [{ quality: 'Default', url: videoUrl }] : [],
	};
}

function normalizeXiaohongshu(rawData: unknown): NormalizedVideoInfo {
	const data = asRecord(getResultData(rawData));
	const author = asRecord(data?.author);
	const engagement = asRecord(data?.engagement);
	const downloads = asStringArray(data?.downloads);
	const images = asStringArray(data?.images);
	const isImage = downloads.length === 0 && images.length > 0;
	return {
		...baseNormalized(),
		contentType: isImage ? 'image' : 'video',
		title: asString(data?.title),
		author: asString(author?.nickname) || asString(data?.author),
		videoUrl: downloads[0] || '',
		imageUrl: isImage ? images[0] || '' : '',
		coverUrl: images[0] || '',
		duration: asNumber(data?.duration),
		description: asString(data?.desc) || asString(data?.description),
		keywords: asString(data?.keywords),
		stats: {
			likes: asNumber(engagement?.likes),
			comments: asNumber(engagement?.comments),
			shares: asNumber(engagement?.shares),
			views: 0,
			collects: asNumber(engagement?.collects),
		},
		links: mediaLinks(downloads, 'Video'),
		downloads,
		images,
	};
}

export function getParserFunctionName(platform: DownloadPlatform): string {
	return PARSER_FUNCTION_NAMES[platform];
}

function parseHttpUrl(url: string): URL {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
		return parsed;
	} catch {
		throw new Error('请输入有效的 HTTP 或 HTTPS 视频链接');
	}
}

export function detectPlatform(url: string): SelectablePlatform {
	const hostname = parseHttpUrl(url).hostname.toLowerCase();

	if (
		hostname === 'douyin.com' ||
		hostname.endsWith('.douyin.com') ||
		hostname.endsWith('.iesdouyin.com')
	)
		return 'douyin';
	if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok';
	if (
		hostname === 'instagram.com' ||
		hostname.endsWith('.instagram.com') ||
		hostname === 'instagr.am'
	)
		return 'instagram';
	if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch')
		return 'facebook';
	if (
		hostname === 'twitter.com' ||
		hostname.endsWith('.twitter.com') ||
		hostname === 'x.com' ||
		hostname.endsWith('.x.com')
	)
		return 'twitter';
	if (
		hostname === 'youtube.com' ||
		hostname.endsWith('.youtube.com') ||
		hostname === 'youtu.be' ||
		hostname.endsWith('.youtube-nocookie.com')
	)
		return 'youtube';
	if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com') || hostname === 'b23.tv')
		throw new Error('B站目前不受支持，请使用专用的 B站下载节点');
	if (hostname === 'kuaishou.com' || hostname.endsWith('.kuaishou.com')) return 'kuaishou';
	if (
		hostname === 'xiaohongshu.com' ||
		hostname.endsWith('.xiaohongshu.com') ||
		hostname === 'xhslink.com' ||
		hostname.endsWith('.xhslink.com')
	)
		return 'xiaohongshu';

	throw new Error('无法识别视频平台，请手动选择平台');
}

export function normalizeVideoInfo(
	platform: DownloadPlatform,
	rawData: unknown,
): NormalizedVideoInfo {
	assertParserSuccess(rawData);

	const normalizers: Record<DownloadPlatform, (data: unknown) => NormalizedVideoInfo> = {
		douyin: normalizeDouyin,
		tiktok: normalizeTikTok,
		instagram: normalizeInstagram,
		facebook: normalizeFacebook,
		twitter: normalizeTwitter,
		youtube: normalizeYouTube,
		kuaishou: normalizeKuaishou,
		xiaohongshu: normalizeXiaohongshu,
	};
	const normalized = normalizers[platform](rawData);
	if (!normalized.videoUrl && normalized.images.length === 0) {
		throw new Error(EMPTY_MEDIA_ERROR);
	}
	return normalized;
}

export async function parseVideo(
	url: string,
	selectedPlatform: SelectablePlatform | 'auto',
): Promise<{ platform: DownloadPlatform; normalized: NormalizedVideoInfo; rawData: unknown }> {
	parseHttpUrl(url);
	const platform = selectedPlatform === 'auto' ? detectPlatform(url) : selectedPlatform;

	const parser = PARSER_FUNCTIONS[platform];
	let rawData = await parser(url);
	let normalized: NormalizedVideoInfo;
	try {
		normalized = normalizeVideoInfo(platform, rawData);
	} catch (error) {
		if (!(error instanceof Error) || error.message !== EMPTY_MEDIA_ERROR) throw error;
		// Some upstream endpoints occasionally return a successful response without media.
		// Retry once before surfacing the empty-result error to the workflow.
		rawData = await parser(url);
		normalized = normalizeVideoInfo(platform, rawData);
	}
	return {
		platform,
		normalized,
		rawData,
	};
}

function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split('.').map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
		return false;
	const [first, second] = parts;
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		(first === 100 && second >= 64 && second <= 127) ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		(first === 198 && (second === 18 || second === 19)) ||
		first >= 224
	);
}

export function assertSafeMediaUrl(value: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('上游返回了无效的媒体地址');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('只允许下载 HTTP 或 HTTPS 媒体地址');
	}

	const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	const blockedHostname =
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname === 'metadata.google.internal' ||
		hostname === '::' ||
		hostname === '::1' ||
		/^f[cd][0-9a-f:]+$/i.test(hostname) ||
		/^fe[89ab][0-9a-f:]+$/i.test(hostname) ||
		isPrivateIpv4(hostname);
	if (blockedHostname) throw new Error('出于安全原因，拒绝下载本地或私有网络地址');
}
