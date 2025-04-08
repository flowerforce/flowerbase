import { evaluateExpression } from '../roles/helpers';
import { Params, Role } from '../roles/interface';
import { evaluateTopLevelWriteFn } from '../roles/machines/read/C/validators';

jest.mock('../roles/helpers', () => ({
    evaluateExpression: jest.fn(),
}));

const mockedRole = {} as Role

const mockUser = {}
const mockParams = {
    type: "read"
} as Params

describe('evaluateTopLevelWriteFn', () => {
    it('should return undefined if type is different from read and write', async () => {
        const isValid = await evaluateTopLevelWriteFn({
            role: mockedRole,
            user: mockUser,
            params: { type: "delete" } as Params
        })
        expect(isValid).toBe(undefined)
        expect(evaluateExpression).not.toHaveBeenCalled()
    });
    it('should return false if type is read but evaluate expression returns false', async () => {
        (evaluateExpression as jest.Mock).mockResolvedValueOnce(false)
        const isValid = await evaluateTopLevelWriteFn({
            role: { ...mockedRole, write: false },
            user: mockUser,
            params: mockParams
        })
        expect(isValid).toBe(false)
        expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
    });
    it('should return true if type is read and evaluate expression returns true', async () => {
        (evaluateExpression as jest.Mock).mockResolvedValueOnce(true)
        const isValid = await evaluateTopLevelWriteFn({
            role: { ...mockedRole, write: false },
            user: mockUser,
            params: mockParams
        })
        expect(isValid).toBe(true)
        expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
    });
    it('should return false if type is write but evaluate expression returns false', async () => {
        (evaluateExpression as jest.Mock).mockResolvedValueOnce(false)
        const isValid = await evaluateTopLevelWriteFn({
            role: { ...mockedRole, write: false },
            user: mockUser,
            params: { type: "write" } as Params
        })
        expect(isValid).toBe(false)
        expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
    });
    it('should return true if type is write and evaluate expression returns true', async () => {
        (evaluateExpression as jest.Mock).mockResolvedValueOnce(true)
        const isValid = await evaluateTopLevelWriteFn({
            role: { ...mockedRole, write: false },
            user: mockUser,
            params: { type: "write" } as Params
        })
        expect(isValid).toBe(true)
        expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
    });
});
