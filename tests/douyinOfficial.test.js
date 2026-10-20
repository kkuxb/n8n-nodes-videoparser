'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
	extractDouyinUrl,
	extractPageData,
	normalizeOfficialAweme,
	parseDouyinOfficial,
	createDouyinContext,
} = require('../dist/nodes/VideoParser/douyinOfficial');
const aweme = require('./fixtures/douyin/video.json');
const html = (data) =>
	`<script>window._ROUTER_DATA = ${JSON.stringify({ loaderData: data })};</script>`;
test('bracket scanner handles escaped quotes and RENDER_DATA', () => {
	const data = { desc: 'brace } and "quote" \\', x: [{ a: 1 }] };
	assert.deepEqual(extractPageData(html(data)), { loaderData: data });
	assert.deepEqual(
		extractPageData(
			`<script type="application/json" id="RENDER_DATA">${encodeURIComponent(JSON.stringify(data))}</script>`,
		),
		data,
	);
});
test('standard/share/text links validate official hosts', () => {
	assert.equal(extractDouyinUrl('分享 https://v.douyin.com/test/ 复制').hostname, 'v.douyin.com');
	for (const url of [
		'https://douyin.com.evil.com/video/123',
		'https://evil.com/video/123',
		'https://user@www.douyin.com/video/123',
	])
		assert.throws(() => extractDouyinUrl(url), /官方/);
});
test('cold empty page retries using same anonymous cookies and matches requested ID', async () => {
	let calls = [];
	const result = await parseDouyinOfficial(
		'https://www.douyin.com/video/123',
		async (url, headers) => {
			calls.push({ url, headers });
			return {
				status: 200,
				headers: { 'set-cookie': ['ttwid=anonymous; Domain=.iesdouyin.com; Path=/; Secure'] },
				data:
					calls.length === 1
						? html({})
						: html({ recommended: { ...aweme, aweme_id: '999' }, requested: aweme }),
			};
		},
	);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].headers.Cookie, undefined);
	assert.equal(calls[1].headers.Cookie, 'ttwid=anonymous');
	assert.equal(result.rawData.awemeId, '123');
	assert.equal(result.normalized.duration, 8.334);
	assert.match(result.normalized.videoUrl, /\/play\//);
	assert.match(result.normalized.videoUrl, /sign=playwm/);
	assert.equal(JSON.stringify(result.rawData).includes('anonymous'), false);
});
test('short link resolves once before the two share-page reads', async () => {
	const calls = [];
	await parseDouyinOfficial('https://v.douyin.com/test/', async (url) => {
		calls.push(url);
		return url.includes('v.douyin')
			? {
					status: 302,
					headers: { location: 'https://www.iesdouyin.com/share/video/123/' },
					data: '',
				}
			: { status: 200, headers: {}, data: html({ aweme }) };
	});
	assert.equal(calls.length, 2);
});
test('modal_id selects the active video in direct and redirected search URLs', async () => {
	const searchUrl = 'https://www.douyin.com/video/111/search/test?modal_id=123&type=general';
	for (const input of [searchUrl, 'https://v.douyin.com/test/']) {
		const calls = [];
		const result = await parseDouyinOfficial(input, async (url) => {
			calls.push(url);
			if (url === 'https://v.douyin.com/test/')
				return { status: 302, headers: { location: searchUrl }, data: '' };
			assert.equal(url, 'https://www.iesdouyin.com/share/video/123/');
			return { status: 200, headers: {}, data: html({ aweme }) };
		});
		assert.equal(result.rawData.awemeId, '123');
		assert.equal(calls.length, input === searchUrl ? 1 : 2);
	}
	await assert.rejects(
		parseDouyinOfficial(searchUrl.replace('modal_id=123', 'modal_id=invalid'), async () => {
			throw Error('invalid ID must not issue a request');
		}),
		/视频 ID/,
	);
});
test('first response without cookies still permits bounded session initialization', async () => {
	let calls = 0;
	await parseDouyinOfficial('https://www.douyin.com/video/123', async (url, headers) => {
		calls++;
		if (calls === 3) assert.equal(headers.Cookie, 'ttwid=anonymous');
		return {
			status: 200,
			headers:
				calls === 2 ? { 'set-cookie': ['ttwid=anonymous; Domain=.iesdouyin.com; Path=/'] } : {},
			data: html(calls === 3 ? { aweme } : {}),
		};
	});
	assert.equal(calls, 3);
});
test('permission tri-state, denied and image posts', () => {
	assert.deepEqual(normalizeOfficialAweme(aweme, '123').permissions, {
		share: 'allowed',
		download: 'allowed',
	});
	assert.deepEqual(
		normalizeOfficialAweme({ ...aweme, video_control: undefined }, '123').permissions,
		{ share: 'unknown', download: 'unknown' },
	);
	assert.throws(
		() => normalizeOfficialAweme({ ...aweme, video_control: { allow_download: false } }, '123'),
		/明确禁止/,
	);
	assert.throws(
		() => normalizeOfficialAweme({ ...aweme, video: undefined, images: [{}] }, '123'),
		/图文/,
	);
});
test('empty/mismatched data does not falsely report deleted; explicit deletion and HTTP denial do', async () => {
	for (const data of [html({}), html({ ...aweme, aweme_id: '999' })]) {
		let calls = 0;
		await assert.rejects(
			parseDouyinOfficial('https://www.douyin.com/video/123', async () => {
				calls++;
				return { status: 200, headers: {}, data };
			}),
			/无法据此判定/,
		);
		assert.equal(calls, 3);
	}
	await assert.rejects(
		parseDouyinOfficial('https://www.douyin.com/video/123', async () => ({
			status: 200,
			headers: {},
			data: '该作品已删除',
		})),
		/明确提示/,
	);
	await assert.rejects(
		parseDouyinOfficial('https://www.douyin.com/video/123', async () => ({
			status: 403,
			headers: {},
			data: '',
		})),
		/拒绝访问/,
	);
});
test('deletion text in unrelated content does not stop session initialization', async () => {
	for (const firstPage of [
		html({ recommended: { ...aweme, aweme_id: '999', desc: '视频已删除怎么办' } }),
		'<script>const message = "该作品已删除";</script>',
		'<!-- 作品不存在 --><template>视频已删除</template>',
		'<p>视频已删除怎么办</p>',
		'<p>更多视频</p><p>视频已删除</p>',
	]) {
		let calls = 0;
		const result = await parseDouyinOfficial('https://www.douyin.com/video/123', async () => ({
			status: 200,
			headers: {},
			data: ++calls === 1 ? firstPage : html({ aweme }),
		}));
		assert.equal(calls, 2);
		assert.equal(result.rawData.awemeId, '123');
	}
});
test('unambiguous visible deletion pages still report deletion', async () => {
	for (const data of [
		'该作品已删除',
		'<html><head><title>抖音</title></head><body><p>视频已删除。</p></body></html>',
		'<script>const template = "other content";</script><div>作品不存在</div>',
	]) {
		let calls = 0;
		await assert.rejects(
			parseDouyinOfficial('https://www.douyin.com/video/123', async () => {
				calls++;
				return { status: 200, headers: {}, data };
			}),
			/明确提示/,
		);
		assert.equal(calls, 1);
	}
});
test('CookieJar applies domain, path, secure and isolates media hosts', async () => {
	const context = createDouyinContext();
	await context.acceptSetCookie('https://www.iesdouyin.com/share/video/123/', [
		'a=one; Path=/share; Secure',
		'b=two; Domain=evil.com; Path=/',
	]);
	assert.equal(
		(await context.headersFor('https://www.iesdouyin.com/share/video/456/')).Cookie,
		'a=one',
	);
	for (const url of [
		'https://cdn.example/video.mp4',
		'https://www.iesdouyin.com/other',
		'http://www.iesdouyin.com/share/video/123/',
	])
		assert.equal((await context.headersFor(url)).Cookie, undefined);
});

test('short-link plus share reads share one total parse deadline', async () => {
	let calls = 0;
	const signals = [];
	const start = Date.now();
	await assert.rejects(
		parseDouyinOfficial(
			'https://v.douyin.com/test/',
			async (_url, _headers, signal) => {
				calls++;
				signals.push(signal);
				if (calls === 1)
					return {
						status: 302,
						headers: { location: 'https://www.iesdouyin.com/share/video/123/' },
						data: '',
					};
				await new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
				});
				throw Error('request should have been aborted');
			},
			55,
		),
		/解析超过/,
	);
	assert.ok(Date.now() - start < 250);
	assert.equal(calls, 2);
	assert.equal(signals[0], signals[1]);
});
