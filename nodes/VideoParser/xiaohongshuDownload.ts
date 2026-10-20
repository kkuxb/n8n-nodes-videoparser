import type { MediaCandidate } from './mediaTransfer';

export function buildXiaohongshuCandidates(url: string): MediaCandidate[] {
	const domestic = new URL(url);
	if (domestic.hostname !== 'sns-video-v28.xhscdn.com' || domestic.username || domestic.password) {
		return [{ url, source: 'original' }];
	}
	domestic.hostname = 'sns-video-v4.xhscdn.com';
	return [
		{ url: domestic.href, source: 'xiaohongshu-domestic' },
		{ url, source: 'original' },
	];
}
