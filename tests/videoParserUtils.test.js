'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	assertSafeMediaUrl,
	assertVideoSourceUrl,
	detectPlatform,
	getParserFunctionName,
	normalizeVideoInfo,
	parseVideo,
	resolveVideoMimeType,
} = require('../dist/nodes/VideoParser/videoParserUtils');

test('uses the function names exported by btch-downloader 6.4.0', () => {
	assert.equal(getParserFunctionName('douyin'), 'douyin');
	assert.equal(getParserFunctionName('tiktok'), 'ttdl');
	assert.equal(getParserFunctionName('instagram'), 'igdl');
	assert.equal(getParserFunctionName('facebook'), 'fbdown');
	assert.equal(getParserFunctionName('twitter'), 'twitter');
	assert.equal(getParserFunctionName('youtube'), 'youtube');
	assert.equal(getParserFunctionName('kuaishou'), 'kuaishou');
	assert.equal(getParserFunctionName('xiaohongshu'), 'xiaohongshu');
});

test('detects supported domains and rejects unsupported platforms', () => {
	assert.equal(detectPlatform('https://v.douyin.com/example/'), 'douyin');
	assert.equal(detectPlatform('https://vm.tiktok.com/example/'), 'tiktok');
	assert.equal(detectPlatform('https://www.instagram.com/reel/example/'), 'instagram');
	assert.equal(detectPlatform('https://fb.watch/example/'), 'facebook');
	assert.equal(detectPlatform('https://x.com/user/status/123'), 'twitter');
	assert.equal(detectPlatform('https://youtu.be/example'), 'youtube');
	assert.equal(detectPlatform('https://v.kuaishou.com/example'), 'kuaishou');
	assert.equal(detectPlatform('https://xhslink.com/o/example'), 'xiaohongshu');
	assert.throws(() => detectPlatform('https://b23.tv/example'), /B站目前不受支持/);
	assert.throws(() => detectPlatform('file:///etc/passwd'), /HTTP 或 HTTPS/);
});

test('normalizes Douyin responses', () => {
	const result = normalizeVideoInfo('douyin', {
		status: true,
		result: {
			status: true,
			data: {
				title: 'Douyin title',
				thumbnail: 'https://cdn.example/cover.jpg',
				links: [{ quality: 'HD', url: 'https://cdn.example/douyin.mp4' }],
			},
		},
	});
	assert.equal(result.videoUrl, 'https://cdn.example/douyin.mp4');
	assert.equal(result.title, 'Douyin title');
	assert.equal(result.links[0].quality, 'HD');
});

test('normalizes TikTok, Instagram, and Facebook response variants', () => {
	const tiktok = normalizeVideoInfo('tiktok', {
		status: true,
		title: 'TikTok title',
		thumbnail: 'https://cdn.example/tiktok.jpg',
		video: ['https://cdn.example/tiktok.mp4'],
		audio: ['https://cdn.example/tiktok.mp3'],
	});
	assert.equal(tiktok.videoUrl, 'https://cdn.example/tiktok.mp4');
	assert.equal(tiktok.audioUrl, 'https://cdn.example/tiktok.mp3');

	const instagram = normalizeVideoInfo('instagram', {
		status: true,
		result: [
			{ thumbnail: 'https://cdn.example/ig.jpg', url: 'https://cdn.example/ig.mp4' },
		],
	});
	assert.equal(instagram.videoUrl, 'https://cdn.example/ig.mp4');
	assert.equal(instagram.coverUrl, 'https://cdn.example/ig.jpg');

	const facebook = normalizeVideoInfo('facebook', {
		status: true,
		HD: 'https://cdn.example/fb-hd.mp4',
		Normal_video: 'https://cdn.example/fb.mp4',
	});
	assert.equal(facebook.videoUrl, 'https://cdn.example/fb-hd.mp4');
	assert.deepEqual(
		facebook.links.map((link) => link.quality),
		['HD', 'Normal'],
	);
});

test('normalizes Twitter and YouTube response variants', () => {
	const twitter = normalizeVideoInfo('twitter', {
		status: true,
		title: 'Tweet title',
		url: [
			{ hd: 'https://cdn.example/x-hd.mp4' },
			{ sd: 'https://cdn.example/x-sd.mp4' },
		],
	});
	assert.equal(twitter.videoUrl, 'https://cdn.example/x-hd.mp4');
	assert.deepEqual(
		twitter.links.map((link) => link.quality),
		['HD', 'SD'],
	);

	const youtube = normalizeVideoInfo('youtube', {
		status: true,
		title: 'YouTube title',
		author: 'Creator',
		thumbnail: 'https://cdn.example/yt.jpg',
		mp4: 'https://cdn.example/yt.mp4',
		mp3: 'https://cdn.example/yt.mp3',
	});
	assert.equal(youtube.videoUrl, 'https://cdn.example/yt.mp4');
	assert.equal(youtube.audioUrl, 'https://cdn.example/yt.mp3');
	assert.equal(youtube.author, 'Creator');
});

test('normalizes Kuaishou metadata and Xiaohongshu video download objects', () => {
	const kuaishou = normalizeVideoInfo('kuaishou', {
		status: true,
		result: {
			success: true,
			videoUrl: 'https://cdn.example/kuaishou.mp4',
			title: 'Kuaishou title',
			author: 'Original audio',
			username: 'Creator',
			likeCount: 12,
			commentCount: 3,
			viewCount: 456,
			duration: 30000,
		},
	});
	assert.equal(kuaishou.videoUrl, 'https://cdn.example/kuaishou.mp4');
	assert.equal(kuaishou.stats.views, 456);

	const xiaohongshu = normalizeVideoInfo('xiaohongshu', {
		status: true,
		result: {
			author: { nickname: 'Rednote creator' },
			title: 'Rednote title',
			desc: 'Description',
			images: ['https://cdn.example/xhs-cover.jpg'],
			downloads: [{ quality: 'HD', url: 'https://cdn.example/xhs.mp4' }],
			engagement: { likes: 10, comments: 2, shares: 1, collects: 4 },
		},
	});
	assert.equal(xiaohongshu.contentType, 'video');
	assert.equal(xiaohongshu.author, 'Rednote creator');
	assert.equal(xiaohongshu.videoUrl, 'https://cdn.example/xhs.mp4');
	assert.equal(xiaohongshu.coverUrl, 'https://cdn.example/xhs-cover.jpg');
	assert.equal(xiaohongshu.links[0].quality, 'HD');
	assert.equal(xiaohongshu.stats.collects, 4);
});

test('turns resolved upstream failures and empty results into errors', () => {
	assert.throws(
		() => normalizeVideoInfo('xiaohongshu', { status: false, message: 'No results found' }),
		/No results found/,
	);
	assert.throws(
		() => normalizeVideoInfo('youtube', { status: true, mp4: null }),
		/没有返回可下载的视频/,
	);
	assert.throws(
		() =>
			normalizeVideoInfo('xiaohongshu', {
				status: true,
				result: {
					images: ['https://cdn.example/xhs-image.jpg'],
					downloads: [],
				},
			}),
		/图片或图文内容不受此节点支持/,
	);
});

test('rejects source URLs that identify non-video posts', () => {
	assert.doesNotThrow(() =>
		assertVideoSourceUrl('instagram', 'https://www.instagram.com/reel/example/'),
	);
	assert.doesNotThrow(() => assertVideoSourceUrl('facebook', 'https://fb.watch/example/'));
	assert.doesNotThrow(() =>
		assertVideoSourceUrl('facebook', 'https://www.facebook.com/user/videos/123/'),
	);
	assert.throws(
		() => assertVideoSourceUrl('instagram', 'https://www.instagram.com/p/example/'),
		/不支持图片帖/,
	);
	assert.throws(
		() => assertVideoSourceUrl('tiktok', 'https://www.tiktok.com/@creator/photo/123'),
		/TikTok 图文链接不受支持/,
	);
	assert.throws(
		() => assertVideoSourceUrl('facebook', 'https://www.facebook.com/photo/123'),
		/仅支持 Watch、Reels 或 videos/,
	);
});

test('accepts verified video responses and rejects image or HTML downloads', () => {
	assert.equal(resolveVideoMimeType('video/mp4', undefined, 'https://cdn.example/data'), 'video/mp4');
	assert.equal(
		resolveVideoMimeType(
			'application/octet-stream',
			'attachment; filename="instagram.mp4"',
			'https://cdn.example/data',
		),
		'video/mp4',
	);
	assert.equal(
		resolveVideoMimeType('binary/octet-stream', undefined, 'https://cdn.example/video.webm?x=1'),
		'video/webm',
	);
	assert.throws(
		() => resolveVideoMimeType('image/jpeg', undefined, 'https://cdn.example/image.jpg'),
		/不是视频内容/,
	);
	assert.throws(
		() => resolveVideoMimeType('text/html', undefined, 'https://cdn.example/error'),
		/不是视频内容/,
	);
});

test('rejects private and non-HTTP media URLs', () => {
	assert.doesNotThrow(() => assertSafeMediaUrl('https://cdn.example/video.mp4'));
	assert.throws(() => assertSafeMediaUrl('http://127.0.0.1/video.mp4'), /私有网络/);
	assert.throws(() => assertSafeMediaUrl('http://169.254.169.254/latest/meta-data'), /私有网络/);
	assert.throws(() => assertSafeMediaUrl('file:///etc/passwd'), /HTTP 或 HTTPS/);
});

test('validates URLs before calling the upstream SDK', async () => {
	await assert.rejects(parseVideo('file:///etc/passwd', 'auto'), /HTTP 或 HTTPS/);
});
