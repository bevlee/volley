/**
 * Players' names: a label on a seat, never an identity (the playerId is that), so two players can
 * share one. Shared by the browser and the server.
 */

export const NAME_MAX = 16;

/** A name as it will be shown: trimmed, inner spaces collapsed, no control characters, at most 16 characters. Empty if nothing's left. */
export function cleanName(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	// Whitespace first: tabs and newlines are control characters too, but should become spaces.
	const text = raw
		.replace(/\s+/g, ' ')
		.replace(/\p{Cc}|\p{Cf}/gu, '')
		.trim();
	return [...text].slice(0, NAME_MAX).join('').trim();
}
