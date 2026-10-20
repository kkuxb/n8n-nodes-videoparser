import axios from 'axios';
import { CookieJar } from 'tough-cookie';

import type { RequestContext } from './mediaTransfer';
import { assertSafeMediaUrl, baseNormalized } from './videoParserUtils';
import type { OfficialPermissionInfo, ParsedVideo, PermissionState } from './videoParserUtils';

const MOBILE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
type RecordValue = Record<string, unknown>;
type PageResponse = {
	status: number;
	data: string;
	headers: { location?: string; 'set-cookie'?: string[] };
};
type PageRequest = (
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
) => Promise<PageResponse>;

function record(value: unknown): RecordValue | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as RecordValue)
		: undefined;
}

function officialHost(hostname: string): boolean {
	return (
		hostname === 'douyin.com' ||
		hostname.endsWith('.douyin.com') ||
		hostname === 'iesdouyin.com' ||
		hostname.endsWith('.iesdouyin.com')
	);
}

export function extractDouyinUrl(input: string): URL {
	const match = input.match(/https?:\/\/[^\s<>"，。！；]+/i);
	if (!match) throw new Error('请输入有效的抖音视频链接');
	const url = new URL(match[0]);
	if (
		!officialHost(url.hostname) ||
		url.username ||
		url.password ||
		(url.port && url.port !== '443')
	) {
		throw new Error('抖音链接必须属于官方域名');
	}
	return url;
}

function awemeIdFromUrl(url: URL): string | undefined {
	return url.searchParams.get('modal_id') || url.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1];
}

function isExplicitDeletionPage(html: string): boolean {
	// Only classify a page-level message, not descriptions or embedded templates.
	const text = html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(head|script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
		.trim();
	return /^(?:该作品已删除|作品不存在|视频已删除)[。！!]?$/u.test(text);
}

export function createDouyinContext(): RequestContext {
	const jar = new CookieJar();
	return {
		async headersFor(url) {
			const cookie = officialHost(new URL(url).hostname) ? await jar.getCookieString(url) : '';
			const headers: Record<string, string> = {
				'User-Agent': MOBILE_UA,
				'Accept-Encoding': 'identity',
			};
			if (cookie) headers.Cookie = cookie;
			return headers;
		},
		async acceptSetCookie(url, cookies) {
			if (!officialHost(new URL(url).hostname)) return;
			for (const cookie of cookies) await jar.setCookie(cookie, url, { ignoreError: true });
		},
	};
}

export function extractPageData(html: string): unknown {
	const marker = /window\._ROUTER_DATA\s*=\s*/g.exec(html);
	if (marker) {
		const start = marker.index + marker[0].length;
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let i = start; i < html.length; i++) {
			const char = html[i];
			if (inString) {
				if (escaped) escaped = false;
				else if (char === '\\') escaped = true;
				else if (char === '"') inString = false;
			} else if (char === '"') inString = true;
			else if (char === '{' || char === '[') depth++;
			else if (char === '}' || char === ']') {
				if (--depth === 0) return JSON.parse(html.slice(start, i + 1));
			}
		}
	}
	const render = html.match(/<script\b[^>]*\bid=["']RENDER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
	if (render) return JSON.parse(decodeURIComponent(render[1].trim()));
	return undefined;
}

function findAweme(value: unknown, id: string): RecordValue | undefined {
	const object = record(value);
	if (
		object &&
		String(object.aweme_id ?? object.awemeId ?? '') === id &&
		(object.video || object.images || object.image_post_info)
	)
		return object;
	const children = Array.isArray(value) ? value : Object.values(object || {});
	for (const child of children) {
		if (child && typeof child === 'object') {
			const found = findAweme(child, id);
			if (found) return found;
		}
	}
	return undefined;
}

function urls(value: unknown): string[] {
	const address = record(value);
	const list = address?.url_list ?? address?.urlList;
	return Array.isArray(list)
		? list.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url))
		: [];
}

function permission(...values: unknown[]): PermissionState {
	if (values.includes(false) || values.includes(0)) return 'denied';
	if (values.includes(true) || values.includes(1)) return 'allowed';
	return 'unknown';
}

export function normalizeOfficialAweme(aweme: RecordValue, id: string): ParsedVideo {
	const control = record(aweme.video_control ?? aweme.videoControl);
	const share = record(aweme.share_info ?? aweme.shareInfo);
	const permissions: OfficialPermissionInfo = {
		share: permission(aweme.can_share, aweme.allow_share, control?.allow_share, share?.can_share),
		download: permission(aweme.allow_download, control?.allow_download, control?.allowDownload),
	};
	if (permissions.share === 'denied' || permissions.download === 'denied')
		throw new Error('该抖音作品明确禁止分享或下载');
	const video = record(aweme.video);
	if (!video || aweme.aweme_type === 68 || aweme.aweme_type === 150)
		throw new Error('图片或图文内容不受此节点支持');
	const candidates = [
		...new Set(
			urls(video.play_addr ?? video.playAddr).map((value) => {
				const url = new URL(value);
				url.pathname = url.pathname.replace(/\/playwm\//g, '/play/');
				assertSafeMediaUrl(url.href);
				return url.href;
			}),
		),
	].slice(0, 3);
	if (!candidates.length) throw new Error('抖音官方页面未返回视频播放地址');
	const author = record(aweme.author);
	const stats = record(aweme.statistics);
	const description = typeof aweme.desc === 'string' ? aweme.desc : '';
	const links = candidates.map((url, i) => ({ quality: `Official ${i + 1}`, url }));
	const normalized = {
		...baseNormalized(),
		title: description,
		description,
		author: typeof author?.nickname === 'string' ? author.nickname : '',
		videoUrl: candidates[0],
		coverUrl: urls(video.cover ?? video.origin_cover ?? video.originCover)[0] || '',
		duration: Number(video.duration ?? aweme.duration ?? 0) / 1000,
		links,
		downloads: candidates,
		stats: {
			likes: Number(stats?.digg_count || 0),
			comments: Number(stats?.comment_count || 0),
			shares: Number(stats?.share_count || 0),
			views: Number(stats?.play_count || 0),
			collects: Number(stats?.collect_count || 0),
		},
	};
	return {
		platform: 'douyin',
		normalized,
		permissions,
		rawData: {
			source: 'douyin-official-share',
			awemeId: id,
			permissions,
			title: description,
			links,
		},
	};
}

const defaultRequest: PageRequest = async (url, headers, signal) => {
	const response = await axios.get<string>(url, {
		headers,
		signal,
		responseType: 'text',
		maxRedirects: 0,
		timeout: 10_000,
		maxContentLength: 4 * 1024 * 1024,
		validateStatus: () => true,
	});
	return response;
};

export async function parseDouyinOfficial(
	input: string,
	request: PageRequest = defaultRequest,
	totalMs = 30_000,
): Promise<ParsedVideo> {
	let url = extractDouyinUrl(input);
	const context = createDouyinContext();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), totalMs);
	async function getPage(target: URL): Promise<PageResponse> {
		extractDouyinUrl(target.href);
		const response = await request(
			target.href,
			await context.headersFor(target.href),
			controller.signal,
		);
		await context.acceptSetCookie(target.href, response.headers['set-cookie'] || []);
		if ([401, 403].includes(response.status))
			throw new Error(`抖音官方拒绝访问（HTTP ${response.status}）`);
		if (response.status >= 400) throw new Error(`抖音官方页面 HTTP ${response.status}`);
		return response;
	}
	try {
		let id = awemeIdFromUrl(url);
		if (!id && url.hostname === 'v.douyin.com') {
			for (let i = 0; i < 5 && !id; i++) {
				const response = await getPage(url);
				if (!response.headers.location) break;
				url = new URL(response.headers.location, url);
				if (!officialHost(url.hostname)) throw new Error('抖音链接重定向到非官方域名');
				id = awemeIdFromUrl(url);
			}
		}
		if (!id || !/^\d+$/.test(id)) throw new Error('未能从抖音链接识别视频 ID');
		const pageUrl = new URL(`https://www.iesdouyin.com/share/video/${id}/`);
		// Some edge responses omit Set-Cookie on the first read. One additional
		// bounded read lets the same anonymous session finish initialization.
		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await getPage(pageUrl);
			if (response.status !== 200) throw new Error('抖音官方分享页发生未预期重定向');
			const data = extractPageData(response.data);
			const root = record(data);
			const aweme = findAweme(root?.loaderData ?? data, id);
			if (aweme) return { ...normalizeOfficialAweme(aweme, id), requestContext: context };
			if (isExplicitDeletionPage(response.data))
				throw new Error('抖音官方页面明确提示作品不存在或已删除');
		}
		throw new Error(
			'抖音官方分享页未提供当前作品数据；可能为会话初始化、访问限制或链接失效，无法据此判定作品已删除',
		);
	} catch (error) {
		if (controller.signal.aborted) throw new Error('抖音官方页面解析超过 30 秒总时限');
		throw error;
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}
