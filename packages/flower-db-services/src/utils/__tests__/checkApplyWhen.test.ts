import { Document, ObjectId, WithId } from "mongodb"
import { User } from '../../auth/dtos';
import { getValidRule } from '../../services/mongodb-atlas/utils';
import { checkApplyWhen } from "../roles/machines/utils";

jest.mock('../../services/mongodb-atlas/utils', () => ({
    getValidRule: jest.fn(),
}));

const mockUser = {
    id: 'user123',
    role: 'admin',
    name: 'Test User',
} as User;

const mockDocument = {
    _id: new ObjectId(),
    field: 'value',
} as WithId<Document>;

describe('checkApplyWhen', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return true if getValidRule returns a valid rule', () => {
        (getValidRule as jest.Mock).mockReturnValue([{ rule: 'some rule' }]);
        const result = checkApplyWhen({ condition: 'test' }, mockUser, mockDocument);
        expect(result).toBe(true);
        expect(getValidRule).toHaveBeenCalledWith({
            filters: [{ apply_when: { condition: 'test' } }],
            user: mockUser,
            record: mockDocument,
        });
    });

    it('should return false if getValidRule returns an empty array', () => {
        (getValidRule as jest.Mock).mockReturnValue([]);
        const result = checkApplyWhen({ condition: 'test' }, mockUser, mockDocument);
        expect(result).toBe(false);
    });

    it('should return false if document is null', () => {
        (getValidRule as jest.Mock).mockReturnValue([]);
        const result = checkApplyWhen({ condition: 'test' }, mockUser, null);
        expect(result).toBe(false);
    });
});
