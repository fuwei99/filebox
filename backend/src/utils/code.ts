import { customAlphabet } from 'nanoid';

// 使用易读的字符集，排除容易混淆的字符
const alphabet = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export const generateCode = customAlphabet(alphabet, 6);
