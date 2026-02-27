import { ObjectId } from 'bson'
import { User } from '../../fastify'
import { Role } from '../roles/interface'
import { MachineContext } from '../roles/machines/interface'
import { checkIsValidFieldNameFn } from '../roles/machines/read/D/validators'

const mockUser = {} as User
const mockId = new ObjectId()

describe('checkIsValidFieldNameFn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns only explicitly allowed fields when no fallback is configured', async () => {
    const mockedRole = {
      name: 'test',
      apply_when: { '%%true': true },
      fields: {
        name: { read: true, write: false },
        email: { read: false, write: true },
        age: { read: false, write: false }
      }
    } as Role
    const context = {
      user: mockUser,
      role: mockedRole,
      params: {
        cursor: { _id: mockId, name: 'Alice', email: 'alice@example.com', age: 25 }
      }
    } as MachineContext

    const result = await checkIsValidFieldNameFn(context)
    expect(result).toEqual({
      name: 'Alice',
      email: 'alice@example.com'
    })
  })

  it('uses per-field additional_fields as fallback for unknown fields', async () => {
    const mockedRole = {
      name: 'test',
      apply_when: { '%%true': true },
      fields: {},
      additional_fields: {
        phone: { read: true, write: false },
        address: { read: false, write: true }
      }
    } as Role
    const context = {
      role: mockedRole,
      params: {
        cursor: { _id: mockId, phone: '123456789', address: 'Unknown', city: 'Rome' }
      }
    } as MachineContext

    const result = await checkIsValidFieldNameFn(context)
    expect(result).toEqual({
      phone: '123456789',
      address: 'Unknown'
    })
  })

  it('supports realm-style global additional_fields fallback', async () => {
    const mockedRole = {
      name: 'collaborator',
      apply_when: { '%%true': true },
      fields: {
        roles: { read: true, write: false }
      },
      additional_fields: {
        read: false,
        write: false
      }
    } as Role
    const context = {
      role: mockedRole,
      params: {
        cursor: { roles: ['editor'], email: 'user@example.com' }
      }
    } as MachineContext

    const result = await checkIsValidFieldNameFn(context)
    expect(result).toEqual({
      roles: ['editor']
    })
  })

  it('denies unknown fields when additional_fields global fallback is false', async () => {
    const mockedRole = {
      name: 'test',
      apply_when: { '%%true': true },
      fields: {
        roles: { read: true }
      },
      additional_fields: {
        read: false,
        write: false
      }
    } as Role
    const context = {
      role: mockedRole,
      params: {
        cursor: { email: 'user@example.com' }
      }
    } as MachineContext

    const result = await checkIsValidFieldNameFn(context)
    expect(result).toEqual({})
  })

  it('returns empty object when no field permissions are available', async () => {
    const mockedRole = {
      name: 'test',
      apply_when: { '%%true': true }
    } as Role
    const context = {
      role: mockedRole,
      params: {
        cursor: { _id: mockId, phone: '123456789', address: 'Unknown' }
      }
    } as MachineContext

    const result = await checkIsValidFieldNameFn(context)
    expect(result).toEqual({})
  })
})
