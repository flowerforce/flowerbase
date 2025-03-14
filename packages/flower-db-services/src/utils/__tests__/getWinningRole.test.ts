
import { Document, ObjectId, WithId } from "mongodb"
import { User } from '../../auth/dtos';
import { Role } from "../roles/interface";
import * as Utils from "../roles/machines/utils";

const { getWinningRole } = Utils

const mockUser = {
    id: 'user123',
    role: 'admin',
    name: 'Test User',
} as User;

const mockDocument = {
    _id: new ObjectId(),
    field: 'value',
} as WithId<Document>;

const mockRoles = [
    { name: 'Editor', apply_when: { condition: 'test' } },
    { name: 'Viewer', apply_when: { condition: 'other' } }
] as Role[]


describe('getWinningRole', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return null if roles array is empty', () => {
        expect(getWinningRole(mockDocument, mockUser, [])).toBeNull();
        expect(getWinningRole(mockDocument, mockUser, undefined)).toBeNull();
    });

    it('should return the first matching role', () => {
        const mockCheckApplyWhen = jest.spyOn(Utils, "checkApplyWhen").mockReturnValueOnce(true)
        const result = getWinningRole(mockDocument, mockUser, mockRoles);
        expect(result).toEqual(mockRoles[0]);
        expect(mockCheckApplyWhen).toHaveBeenCalledWith(mockRoles[0].apply_when, mockUser, mockDocument);
        expect(mockCheckApplyWhen).toHaveBeenCalledTimes(1);
        mockCheckApplyWhen.mockReset()
    });

    it('should return null if no roles match', () => {
        const mockCheckApplyWhen = jest.spyOn(Utils, "checkApplyWhen").mockReturnValue(false)
        const result = getWinningRole(mockDocument, mockUser, mockRoles);
        expect(result).toBeNull();
        expect(mockCheckApplyWhen).toHaveBeenCalledTimes(mockRoles.length);
        mockCheckApplyWhen.mockReset()
    });

    it('should check all roles until it finds a match', () => {
        const mockCheckApplyWhen = jest.spyOn(Utils, "checkApplyWhen").mockReturnValueOnce(false).mockReturnValueOnce(true)
        const result = getWinningRole(mockDocument, mockUser, mockRoles);
        expect(result).toEqual(mockRoles[1]);
        expect(mockCheckApplyWhen).toHaveBeenCalledTimes(2);
        mockCheckApplyWhen.mockReset()
    });

    it('should handle null document correctly', () => {
        jest.spyOn(Utils, "checkApplyWhen").mockReturnValue(true)
        const result = getWinningRole(null, mockUser, mockRoles);
        expect(result).toEqual(mockRoles[0]);
    });
});
