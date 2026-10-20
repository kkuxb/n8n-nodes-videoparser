import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

import axios from 'axios';
import type { IBinaryData, IExecuteFunctions } from 'n8n-workflow';

import { assertSafeMediaUrl, resolveVideoMimeType } from './videoParserUtils';

export interface MediaCandidate {
	url: string;
	source: 'official' | 'xiaohongshu-domestic' | 'original';
}

export interface RequestContext {
	headersFor(url: string): Promise<Record<string, string>>;
	acceptSetCookie(url: string, cookies: readonly string[]): Promise<void>;
}

export interface TransferResult {
	binary: IBinaryData;
	usedUrl: string;
}

interface TransferOptions {
	totalMs?: number;
	connectMs?: number;
	idleMs?: number;
	maxBytes?: number;
}

export async function consumeMediaStream<T>(
	source: Readable,
	consume: (input: Readable) => Promise<T>,
	options: { maxBytes: number; signal: AbortSignal; expectedBytes?: number; idleMs?: number },
): Promise<T> {
	let received = 0;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	function clearIdleTimer(): void {
		clearTimeout(idleTimer);
	}
	function resetIdleTimer(): void {
		clearIdleTimer();
		if (options.idleMs !== undefined) {
			idleTimer = setTimeout(
				() => source.destroy(new Error('媒体下载超过无数据等待时限')),
				options.idleMs,
			);
		}
	}
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			resetIdleTimer();
			received += chunk.length;
			callback(received > options.maxBytes ? new Error('媒体文件超过下载上限') : null, chunk);
		},
		flush(callback) {
			clearIdleTimer();
			if (!received) return callback(new Error('下载返回了空文件'));
			if (options.expectedBytes !== undefined && received !== options.expectedBytes) {
				return callback(new Error('媒体文件传输不完整'));
			}
			callback();
		},
	});
	let rejectAbort: (error: Error) => void = () => {};
	const aborted = new Promise<never>((_resolve, reject) => {
		rejectAbort = reject;
	});
	function onAbort(): void {
		rejectAbort(new Error('视频下载超过总时限'));
	}
	options.signal.addEventListener('abort', onAbort, { once: true });
	if (options.signal.aborted) onAbort();
	// A paused source is waiting for storage backpressure, not network data.
	source.on('pause', clearIdleTimer);
	source.on('resume', resetIdleTimer);
	source.once('end', clearIdleTimer);
	try {
		resetIdleTimer();
		const streaming = pipeline(source, limiter, { signal: options.signal });
		const consuming = Promise.resolve().then(() => consume(limiter));
		const [, result] = await Promise.race([Promise.all([streaming, consuming]), aborted]);
		return result;
	} finally {
		clearIdleTimer();
		source.removeListener('pause', clearIdleTimer);
		source.removeListener('resume', resetIdleTimer);
		source.removeListener('end', clearIdleTimer);
		options.signal.removeEventListener('abort', onAbort);
		source.destroy();
		limiter.destroy();
	}
}

class MediaHttpError extends Error {
	constructor(readonly status: number) {
		super(`媒体服务器返回 HTTP ${status}`);
	}
}

export async function downloadCandidates(
	context: Pick<IExecuteFunctions, 'helpers'>,
	candidates: readonly MediaCandidate[],
	requestContext?: RequestContext,
	options: TransferOptions = {},
): Promise<TransferResult> {
	const controller = new AbortController();
	const deadline = setTimeout(() => controller.abort(), options.totalMs ?? 180_000);
	const maxBytes = options.maxBytes ?? 250 * 1024 * 1024;
	const errors: string[] = [];
	try {
		for (const candidate of candidates.slice(0, 3)) {
			if (controller.signal.aborted) break;
			const attemptController = new AbortController();
			const cancelAttempt = (): void => attemptController.abort();
			controller.signal.addEventListener('abort', cancelAttempt, { once: true });
			let source: Readable | undefined;
			try {
				let url = candidate.url;
				for (let redirects = 0; redirects <= 5; redirects++) {
					assertSafeMediaUrl(url);
					const connectTimer = setTimeout(
						() => attemptController.abort(),
						options.connectMs ?? 10_000,
					);
					let response;
					try {
						response = await axios.get<Readable>(url, {
							responseType: 'stream',
							maxRedirects: 0,
							validateStatus: () => true,
							timeout: options.idleMs ?? 30_000,
							signal: attemptController.signal,
							headers: requestContext
								? await requestContext.headersFor(url)
								: {
										'User-Agent': 'Mozilla/5.0',
										'Accept-Encoding': 'identity',
									},
						});
					} finally {
						clearTimeout(connectTimer);
					}
					source = response.data;
					// Keep early socket errors handled while response cookies are processed.
					source.on('error', () => {});
					await requestContext?.acceptSetCookie(url, response.headers['set-cookie'] || []);
					if ([301, 302, 303, 307, 308].includes(response.status)) {
						source.destroy();
						if (!response.headers.location || redirects === 5)
							throw new Error('媒体重定向次数超限');
						url = new URL(response.headers.location, url).href;
						continue;
					}
					if (response.status !== 200) throw new MediaHttpError(response.status);
					const lengthHeader = response.headers['content-length'];
					const expectedBytes = lengthHeader === undefined ? undefined : Number(lengthHeader);
					if (
						expectedBytes !== undefined &&
						(!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxBytes)
					) {
						throw new Error('媒体文件长度无效或超过 250 MiB 下载上限');
					}
					const type = response.headers['content-type'];
					const disposition = response.headers['content-disposition'];
					const mimeType = resolveVideoMimeType(
						typeof type === 'string' ? type : undefined,
						typeof disposition === 'string' ? disposition : undefined,
						url,
					);
					const extensions: Record<string, string> = {
						'video/webm': 'webm',
						'video/quicktime': 'mov',
						'video/x-m4v': 'm4v',
					};
					const binary = await consumeMediaStream(
						source,
						(input) =>
							context.helpers.prepareBinaryData(
								input,
								`video_${Date.now()}.${extensions[mimeType] || 'mp4'}`,
								mimeType,
							),
						{
							maxBytes,
							signal: attemptController.signal,
							expectedBytes,
							idleMs: options.idleMs ?? 30_000,
						},
					);
					return { binary, usedUrl: url };
				}
			} catch (error) {
				errors.push(`${candidate.source}: ${error instanceof Error ? error.message : '下载失败'}`);
				if (
					candidate.source === 'official' &&
					error instanceof MediaHttpError &&
					[401, 403].includes(error.status)
				)
					break;
			} finally {
				controller.signal.removeEventListener('abort', cancelAttempt);
				source?.destroy();
				attemptController.abort();
			}
		}
		if (controller.signal.aborted) errors.push('视频下载超过连接或总时限');
		throw new Error(errors.join('；') || '没有可下载的视频地址');
	} finally {
		clearTimeout(deadline);
		controller.abort();
	}
}
