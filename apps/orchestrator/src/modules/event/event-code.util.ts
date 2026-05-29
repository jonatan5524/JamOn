import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

export function generateEventCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return code;
}
