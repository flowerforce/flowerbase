import { ObjectId } from 'bson';
import { User } from '../../fastify';
import { Role } from '../roles/interface';
import { MachineContext } from '../roles/machines/interface'
import { checkIsValidFieldNameFn } from '../roles/machines/read/D/validators';

const mockUser = {} as User
const mockId = new ObjectId()

describe('checkIsValidFieldNameFn', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should return filtered fields based on role permissions, without excluding _id', () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {
                name: { read: true, write: false },
                email: { read: false, write: true },
            },
            additional_fields: {},
        } as Role
        const context = {
            user: mockUser,
            role: mockedRole,
            params: {
                cursor: { _id: mockId, name: 'Alice', email: 'alice@example.com', age: 25 },
            },
        }

        const result = checkIsValidFieldNameFn(context as MachineContext);
        expect(result).toEqual({ name: 'Alice', email: 'alice@example.com', _id: mockId });
    });
    it("should exclude _id if role doesn't allows it", () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {
                _id: { read: false, write: false },
                name: { read: true, write: false },
            },
            additional_fields: {},
        } as Role
        const context = {
            user: mockUser,
            role: mockedRole,
            params: {
                cursor: { _id: mockId, name: 'Alice' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);

        expect(result).toEqual({ name: 'Alice' });
    });
    it("should include _id if write role allows it", () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {
                _id: { read: false, write: true },
                name: { read: true, write: false },
            },
            additional_fields: {},
        } as Role
        const context = {
            user: mockUser,
            role: mockedRole,
            params: {
                cursor: { _id: mockId, name: 'Alice' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);

        expect(result).toEqual({ _id: mockId, name: 'Alice' });
    });
    it("should include _id if read role allows it", () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {
                _id: { read: true, write: false },
                name: { read: true, write: false },
            },
            additional_fields: {},
        } as Role
        const context = {
            user: mockUser,
            role: mockedRole,
            params: {
                cursor: { _id: mockId, name: 'Alice' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);

        expect(result).toEqual({ _id: mockId, name: 'Alice' });
    });


    it('should return an empty object if no fields are readable/writable', () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {
                name: { read: false, write: false },
            },
            additional_fields: {},
        } as Role
        const context = {
            role: mockedRole,
            params: {
                cursor: { name: 'Charlie', email: 'charlie@example.com' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);

        expect(result).toEqual({});
    });

    it('should handle additional_fields correctly for read permission', () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {},
            additional_fields: { phone: { read: true, write: false } },
        } as Role
        const context = {
            role: mockedRole,
            params: {
                cursor: { _id: mockId, phone: '123456789', address: 'Unknown' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);
        expect(result).toEqual({ _id: mockId, phone: '123456789' });
    });
    it('should handle additional_fields correctly for write permission', () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            },
            fields: {},
            additional_fields: { phone: { read: false, write: true }, address: { read: false, write: true } },
        } as Role
        const context = {
            role: mockedRole,
            params: {
                cursor: { _id: mockId, phone: '123456789', address: 'Unknown' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);
        expect(result).toEqual({ _id: mockId, phone: '123456789', address: 'Unknown' });
    });
    it('should return only the _id if fields and additional fields are not defined', () => {
        const mockedRole = {
            name: "test",
            apply_when: {
                "%%true": true
            }
        } as Role
        const context = {
            role: mockedRole,
            params: {
                cursor: { _id: mockId, phone: '123456789', address: 'Unknown' },
            },
        };

        const result = checkIsValidFieldNameFn(context as MachineContext);
        expect(result).toEqual({ _id: mockId });
    });

});
