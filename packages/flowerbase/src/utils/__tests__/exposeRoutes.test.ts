import Fastify, { FastifyInstance } from 'fastify'
import { API_VERSION } from '../../constants'
import { exposeRoutes } from '../initializer/exposeRoutes'

jest.mock('../../constants', () => ({
    API_VERSION: '/api/client/v2'
}))

const config: {
    app?: FastifyInstance
} = {}

describe('exposeRoutes', () => {

    beforeAll(async () => {
        config.app = Fastify()
        await exposeRoutes(config.app)
        await config.app.ready()
        jest.clearAllMocks();
    })

    afterAll(async () => {
        await config.app!.close()
    })

    it('GET /health should return status ok and uptime', async () => {
        const response = await config.app!.inject({
            method: 'GET',
            url: '/health',
        })
        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.body)
        expect(body).toHaveProperty('status', 'ok')
        expect(body).toHaveProperty('uptime')
        expect(typeof body.uptime).toBe('number')
    })

    it(`GET ${API_VERSION}/app/:appId/location should return correct location data`, async () => {
        const appId = 'it'
        const response = await config.app!.inject({
            method: 'GET',
            url: `${API_VERSION}/app/${appId}/location`,
        })

        expect(response.statusCode).toBe(200)
        expect(JSON.parse(response.body)).toEqual({
            deployment_model: 'LOCAL',
            location: 'IE',
            hostname: 'http://localhost:3000',
            ws_hostname: 'wss://localhost:3000'
        })
    })

    it('exposeRoutes should handle errors in the catch block', async () => {
        const mockedApp = Fastify()
        // Forced fail on get method
        jest.spyOn(mockedApp, 'get').mockImplementation(() => {
            throw new Error('Route registration failed')
        })
        const mockErrorLog = jest.spyOn(console, 'error').mockImplementation(() => { })
        await exposeRoutes(mockedApp)
        expect(mockErrorLog).toHaveBeenCalledWith('Error while exposing routes', 'Route registration failed')
        mockErrorLog.mockRestore()
    })
})
