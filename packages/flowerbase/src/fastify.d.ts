import { FastifyRequest as FastifyRequestType } from 'fastify'

type User = Record<string, unknown>
type UserData = Record<string, unknown>

declare module 'fastify' {
  interface FastifyInstance {
    jwtAuthentication(req: FastifyRequestType, rep: FastifyReply): Promise<void>
    createAccessToken(user: User): string
    createRefreshToken(user: User): string
  }

  interface FastifyRequest {
    user:
      | {
          id: string
          typ: 'refresh'
          sub: string
          user_data: UserData
          user: User
        }
      | {
          typ: 'access'
          user_data: UserData
          id: string
        }
  }
}
