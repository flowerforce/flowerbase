import { User } from "./fastify"
import { Services } from "./services/interface"

export type Context = {
    services: {
        get: <T extends keyof Services>(serviceName: T) => ReturnType<Services[T]>
    },
    user: User
}