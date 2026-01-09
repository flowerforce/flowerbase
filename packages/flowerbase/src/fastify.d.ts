import { FastifyRequest as FastifyRequestType, FastifyReply } from 'fastify'

type User = Record<string, unknown>
type UserData = Record<string, unknown>
type JwtUserData = UserData

type JwtAccessPayload = {
  typ: 'access'
  id: string
  user_data: JwtUserData
  data: JwtUserData
  custom_data?: JwtUserData
}

type JwtRefreshPayload = {
  typ: 'refresh'
  baas_id: string
}

type JwtPayload = JwtAccessPayload | JwtRefreshPayload

type JwtAccessUser = JwtAccessPayload & {
  sub: string
}

type JwtRefreshUser = JwtRefreshPayload & {
  sub: string
}

type JwtUser = JwtAccessUser | JwtRefreshUser

declare module 'fastify' {
  interface FastifyInstance {
    jwtAuthentication(req: FastifyRequestType, rep: FastifyReply): Promise<void>
    createAccessToken(user: User): string
    createRefreshToken(user: User): string
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtUser
  }
}
