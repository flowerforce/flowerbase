import { Db, ObjectId } from 'mongodb'
import { AUTH_CONFIG } from '../constants'

export const revokeRefreshTokens = async (db: Db, userId: ObjectId, now: Date) => {
  await db.collection(AUTH_CONFIG.refreshTokensCollection).updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now } }
  )
}

export const updatePasswordAndRevokeSessions = async (
  db: Db,
  selector: Record<string, unknown>,
  password: string
) => {
  const collection = db.collection(AUTH_CONFIG.authCollection)
  const user = await collection.findOne(selector)
  if (!user) return false

  const now = new Date()
  const result = await collection.updateOne(
    { ...selector, _id: user._id },
    {
      $set: { password, lastLogoutAt: now },
      $inc: { sessionVersion: 1, credentialsVersion: 1 }
    }
  )
  if (!result.matchedCount) return false

  await revokeRefreshTokens(db, user._id, now)
  return true
}
