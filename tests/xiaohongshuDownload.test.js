'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildXiaohongshuCandidates } = require('../dist/nodes/VideoParser/xiaohongshuDownload');
test('maps only exact v28 host and preserves protocol, path and signed query', () => {
	const url = 'http://sns-video-v28.xhscdn.com/a%2Fb.mp4?sign=a%2Bb&x=1&x=2';
	assert.deepEqual(buildXiaohongshuCandidates(url), [
		{ url: url.replace('v28', 'v4'), source: 'xiaohongshu-domestic' },
		{ url, source: 'original' },
	]);
	for (const host of [
		'sns-video-v4.xhscdn.com',
		'sns-video-zl.xhscdn.com',
		'sns-video-v28.xhscdn.com.evil.com',
		'sns-video-v28.xhscdn.com@evil.com',
		'user@sns-video-v28.xhscdn.com',
	]) {
		const url = `https://${host}/x.mp4`;
		assert.deepEqual(buildXiaohongshuCandidates(url), [{ url, source: 'original' }]);
	}
});
