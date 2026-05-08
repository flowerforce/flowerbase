const loadConstantsWithCustomUserData = async (
    customUserDataConfig: Record<string, unknown>
) => {
    jest.resetModules()

    jest.doMock('../auth/utils', () => ({
        loadAuthConfig: jest.fn(() => ({
            auth_collection: 'auth_users',
            auth_database: 'auth-db',
            'local-userpass': {
                disabled: false,
                config: {}
            }
        })),
        loadCustomUserData: jest.fn(() => customUserDataConfig)
    }))

    return import('../constants')
}

describe('AUTH_CONFIG custom user data config', () => {
    it('uses custom user collection when custom_user_data.enabled is true', async () => {
        const { AUTH_CONFIG, DB_NAME } = await loadConstantsWithCustomUserData({
            enabled: true,
            database_name: 'main',
            collection_name: 'users',
            user_id_field: 'id',
            on_user_creation_function_name: 'onCreateUser'
        })

        expect(DB_NAME).toBe('main')
        expect(AUTH_CONFIG.userCollection).toBe('users')
        expect(AUTH_CONFIG.user_id_field).toBe('id')
        expect(AUTH_CONFIG.on_user_creation_function_name).toBe('onCreateUser')
    })

    it('disables custom user collection when custom_user_data.enabled is false', async () => {
        const { AUTH_CONFIG, DB_NAME } = await loadConstantsWithCustomUserData({
            enabled: false,
            database_name: 'main',
            collection_name: 'users',
            user_id_field: 'id',
            on_user_creation_function_name: 'onCreateUser'
        })

        expect(DB_NAME).toBe('main')
        expect(AUTH_CONFIG.userCollection).toBeUndefined()
        expect(AUTH_CONFIG.user_id_field).toBeUndefined()
        expect(AUTH_CONFIG.on_user_creation_function_name).toBeUndefined()
    })
})