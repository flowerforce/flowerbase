import { Params, Role } from '../roles/interface';
import { checkFieldsPropertyExists } from '../roles/machines/read/C/validators';

jest.mock('../roles/helpers', () => ({
    evaluateExpression: jest.fn(),
}));

const mockUser = {}
const mockParams = {} as Params

describe('checkFieldsPropertyExists', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should return false if role fields is not defined', () => {
        const isValid = checkFieldsPropertyExists({
            role: {} as Role,
            user: mockUser,
            params: mockParams
        })
        expect(isValid).toBe(false)
    });
    it('should return false if role fields is empty', () => {
        const isValid = checkFieldsPropertyExists({
            role: {
                fields: {}
            } as Role,
            user: mockUser,
            params: mockParams
        })
        expect(isValid).toBe(false)
    });
    it('should return true if role fields is note empty', () => {
        const isValid = checkFieldsPropertyExists({
            role: {
                fields: {
                    test: {}
                },
                apply_when: {},
                name: "test",
            } as Role,
            user: mockUser,
            params: mockParams
        })
        expect(isValid).toBe(true)
    });
});
