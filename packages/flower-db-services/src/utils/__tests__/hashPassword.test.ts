import { hashPassword } from '../crypto';

describe('hashPassword', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return a hashed password with a valid format', async () => {
        const plaintext = 'mySecretPassword';
        const hashedPassword = await hashPassword(plaintext);
        expect(hashedPassword).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/);
        const [storedHash, salt] = hashedPassword.split('.');
        expect(storedHash).toBeDefined();
        expect(salt).toBeDefined();
    });
    it('should generate different hashes for different passwords', async () => {
        const hash1 = await hashPassword('password1');
        const hash2 = await hashPassword('password2');
        expect(hash1).not.toBe(hash2);
    });
    it('should generate different hashes for the same password (due to different salts)', async () => {
        const plaintext = 'samePassword';
        const hash1 = await hashPassword(plaintext);
        const hash2 = await hashPassword(plaintext);
        expect(hash1).not.toBe(hash2);
    });

});
