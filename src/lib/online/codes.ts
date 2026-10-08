/** Room codes, shared by the server (which makes them) and the browser (which checks what's typed). */

/** Consonants only, so codes can't spell words; no I or O to mix up with 1 and 0. */
export const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE_LENGTH = 4;

/** Codes are typed by hand: accept lower case and stray spaces. */
export const normaliseCode = (code: string) => code.replace(/\s/g, '').toUpperCase();

/** Whether a (normalised) code could be a room code at all. Whether the room exists is the server's to say. */
export const isCode = (code: string) => code.length === CODE_LENGTH && [...code].every((c) => CODE_LETTERS.includes(c));
