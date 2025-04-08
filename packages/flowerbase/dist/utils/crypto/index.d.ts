/**
 * > Creates the hash for a string
 * @param plaintext -> the string that should be encrypted
 * @tested
 */
export declare const hashPassword: (plaintext: string) => Promise<string>;
/**
 * > Compares two strings
 * @param plaintext -> the first string
 * @param storedPassword -> the second string
 * @tested
 */
export declare const comparePassword: (plaintext: string, storedPassword: string) => Promise<boolean>;
/**
 * > Generate a random token
 * @param length -> the token length
 */
export declare const generateToken: (length?: number) => string;
//# sourceMappingURL=index.d.ts.map