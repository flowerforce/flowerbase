export const LOGIN_SCHEMA = {
    body: {
        type: 'object',
        properties:
        {
            apiKey: { type: 'string' },
            options: {
                type: "object",
                properties: {
                    device: {
                        type: "object",
                        properties: {
                            sdkVersion: { type: 'string' },
                            platform: { type: 'string' },
                            platformVersion: { type: 'string' }
                        }
                    }

                }
            },

        },
        required: ['apiKey', 'options']
    }
}