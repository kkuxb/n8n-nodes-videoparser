'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');
const axios = require('axios');
const sdkPath = require.resolve('btch-downloader');
const sdkCalls = [];
const fixtures = {
	ttdl: { video: ['https://cdn.example/tiktok.mp4'] },
	igdl: { result: [{ url: 'https://cdn.example/instagram.mp4' }] },
	fbdown: { HD: 'https://cdn.example/facebook.mp4' },
	twitter: { url: [{ hd: 'https://cdn.example/twitter.mp4' }] },
	youtube: { mp4: 'https://cdn.example/youtube.mp4' },
	kuaishou: { result: { videoUrl: 'https://cdn.example/kuaishou.mp4' } },
	xiaohongshu: { result: { downloads: [{ url: 'https://sns-video-v28.xhscdn.com/video.mp4' }] } },
};
require.cache[sdkPath] = {
	id: sdkPath,
	filename: sdkPath,
	loaded: true,
	exports: Object.fromEntries(
		Object.keys(fixtures)
			.concat('douyin')
			.map((name) => [
				name,
				async (url) => {
					sdkCalls.push({ name, url });
					if (name === 'douyin') throw Error('legacy Douyin must not run');
					return fixtures[name];
				},
			]),
	),
};
const utils = require('../dist/nodes/VideoParser/videoParserUtils');
const official = require('../dist/nodes/VideoParser/douyinOfficial');
const { VideoParser } = require('../dist/nodes/VideoParser/VideoParser.node');
const routes = [
	['tiktok', 'ttdl', 'https://vm.tiktok.com/test/'],
	['instagram', 'igdl', 'https://www.instagram.com/reel/test/'],
	['facebook', 'fbdown', 'https://fb.watch/test/'],
	['twitter', 'twitter', 'https://x.com/a/status/1'],
	['youtube', 'youtube', 'https://youtu.be/test'],
	['kuaishou', 'kuaishou', 'https://v.kuaishou.com/test'],
];
async function execute(items, download = false, continueOnFail = false) {
	return new VideoParser().execute.call({
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, i) =>
			({ videoUrl: items[i].url, platform: items[i].platform || 'auto', downloadVideo: download })[
				name
			],
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'Video Parser' }),
		helpers: {
			prepareBinaryData: async (s, fileName, mimeType) => {
				let bytes = 0;
				for await (const c of s) bytes += c.length;
				return { data: String(bytes), fileName, mimeType };
			},
		},
	});
}
test('six existing platform parsers retain exact URL, function, fields and legacy download options', async (t) => {
	const requests = [];
	t.mock.method(axios, 'get', async (url, options) => {
		requests.push({ url, options });
		return {
			data: Readable.from([Buffer.from('video')]),
			headers: { 'content-type': 'video/mp4' },
		};
	});
	sdkCalls.length = 0;
	const [result] = await execute(
		routes.map(([platform, , url]) => ({ platform, url })),
		true,
	);
	assert.deepEqual(
		sdkCalls,
		routes.map(([, name, url]) => ({ name, url })),
	);
	for (let i = 0; i < result.length; i++) {
		const [platform] = routes[i];
		assert.deepEqual(result[i].json, {
			platform,
			...utils.normalizeVideoInfo(platform, fixtures[routes[i][1]]),
			rawData: fixtures[routes[i][1]],
		});
		assert.equal(result[i].binary.data.data, '5');
		assert.deepEqual(result[i].pairedItem, { item: i });
		assert.equal(requests[i].options.timeout, 60000);
		assert.equal(requests[i].options.maxRedirects, 5);
		assert.equal(requests[i].options.signal, undefined);
	}
});
test('Douyin bypasses legacy SDK, parse-only requests no media; XHS original links stay intact', async (t) => {
	let officialCalls = 0;
	t.mock.method(official, 'parseDouyinOfficial', async () => {
		officialCalls++;
		return {
			platform: 'douyin',
			normalized: {
				...utils.baseNormalized(),
				videoUrl: 'https://cdn.example/douyin.mp4',
				links: [{ quality: 'Official 1', url: 'https://cdn.example/douyin.mp4' }],
			},
			rawData: { source: 'douyin-official-share' },
		};
	});
	t.mock.method(axios, 'get', async () => {
		throw Error('parse-only must not download');
	});
	sdkCalls.length = 0;
	const [result] = await execute([
		{ url: 'https://www.douyin.com/video/123' },
		{ url: 'https://www.xiaohongshu.com/explore/abc' },
	]);
	assert.equal(officialCalls, 1);
	assert.deepEqual(sdkCalls, [
		{ name: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/abc' },
	]);
	assert.equal(result[0].binary, undefined);
	assert.match(result[1].json.videoUrl, /v28/);
});
test('XHS downloads domestic first and output URL records actual media; continueOnFail keeps associations', async (t) => {
	const requests = [];
	t.mock.method(axios, 'get', async (url) => {
		requests.push(url);
		return {
			status: 200,
			headers: { 'content-type': 'video/mp4' },
			data: Readable.from(['video']),
		};
	});
	const [result] = await execute(
		[{ url: 'https://www.xiaohongshu.com/explore/abc' }, { url: '' }],
		true,
		true,
	);
	assert.equal(requests.length, 1);
	assert.match(requests[0], /v4/);
	assert.match(result[0].json.videoUrl, /v4/);
	assert.match(result[0].json.links[0].url, /v28/);
	assert.equal(result[0].binary.data.data, '5');
	assert.deepEqual(result[1].pairedItem, { item: 1 });
	assert.match(result[1].json.error, /不能为空/);
});

test('Douyin node uses official parsing, anonymous cookies and media redirects end to end', async (t) => {
	const aweme = require('./fixtures/douyin/video.json');
	const requests = [];
	t.mock.method(axios, 'get', async (url, options) => {
		requests.push({ url, options });
		if (url === 'https://v.douyin.com/test/')
			return {
				status: 302,
				headers: { location: 'https://www.douyin.com/video/111?modal_id=123' },
				data: '',
			};
		if (url === 'https://www.iesdouyin.com/share/video/123/') {
			const initialized = Boolean(options.headers.Cookie);
			return {
				status: 200,
				headers: { 'set-cookie': ['ttwid=anonymous; Domain=.iesdouyin.com; Path=/; Secure'] },
				data: `<script>window._ROUTER_DATA = ${JSON.stringify({
					loaderData: initialized
						? { aweme }
						: { recommended: { ...aweme, aweme_id: '999', desc: '视频已删除怎么办' } },
				})};</script>`,
			};
		}
		assert.equal(options.headers.Cookie, undefined);
		if (url === 'https://cdn.example/play/video.mp4?sign=playwm')
			return {
				status: 302,
				headers: { location: 'https://cdn.example/final.mp4' },
				data: Readable.from([]),
			};
		assert.equal(url, 'https://cdn.example/final.mp4');
		return {
			status: 200,
			headers: { 'content-type': 'video/mp4', 'content-length': '5' },
			data: Readable.from(['video']),
		};
	});
	sdkCalls.length = 0;
	const [[result]] = await execute([{ url: '分享 https://v.douyin.com/test/ 复制链接' }], true);
	assert.deepEqual(sdkCalls, []);
	assert.equal(requests.length, 5);
	assert.equal(requests[2].options.headers.Cookie, 'ttwid=anonymous');
	assert.equal(result.json.platform, 'douyin');
	assert.equal(result.json.rawData.awemeId, '123');
	assert.equal(result.json.videoUrl, 'https://cdn.example/final.mp4');
	assert.equal(result.json.links[0].url, 'https://cdn.example/play/video.mp4?sign=playwm');
	assert.equal(result.binary.data.data, '5');
	assert.equal(result.binary.data.mimeType, 'video/mp4');
	assert.deepEqual(result.pairedItem, { item: 0 });
	assert.equal(JSON.stringify(result).includes('anonymous'), false);
});

test('XHS node falls back to the signed original URL after domestic rejection', async (t) => {
	const original = 'https://sns-video-v28.xhscdn.com/a%2Fb.mp4?sign=a%2Bb&x=1&x=2';
	const previous = fixtures.xiaohongshu;
	fixtures.xiaohongshu = { result: { downloads: [{ url: original }] } };
	t.after(() => {
		fixtures.xiaohongshu = previous;
	});
	const requests = [];
	t.mock.method(axios, 'get', async (url) => {
		requests.push(url);
		if (requests.length === 1) return { status: 403, headers: {}, data: Readable.from([]) };
		if (requests.length === 2)
			return {
				status: 302,
				headers: { location: 'https://cdn.example/xhs-final.mp4' },
				data: Readable.from([]),
			};
		return {
			status: 200,
			headers: { 'content-type': 'video/mp4', 'content-length': '5' },
			data: Readable.from(['video']),
		};
	});
	const [[result]] = await execute([{ url: 'https://www.xiaohongshu.com/explore/abc' }], true);
	assert.deepEqual(requests, [
		original.replace('v28', 'v4'),
		original,
		'https://cdn.example/xhs-final.mp4',
	]);
	assert.equal(result.json.videoUrl, 'https://cdn.example/xhs-final.mp4');
	assert.equal(result.json.links[0].url, original);
	assert.deepEqual(result.json.downloads, [original]);
	assert.equal(result.binary.data.data, '5');
});
