import { useCallback, useEffect, useState } from 'react'
import type { UserLike } from '@flowerforce/flowerbase-client'
import { Credentials, flowerbaseApp } from '../api/client'

type AuthMode = 'login' | 'register' | 'reset'

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected Flowerbase error'
}

export const useSession = () => {
  const [user, setUser] = useState<UserLike | null>(flowerbaseApp.currentUser)
  const [mode, setMode] = useState<AuthMode>('login')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  const syncUser = useCallback(() => {
    setUser(flowerbaseApp.currentUser)
  }, [])

  useEffect(() => {
    flowerbaseApp.addListener(syncUser)

    const bootstrap = async () => {
      try {
        await flowerbaseApp.currentUser?.refreshAccessToken()
      } catch {
        await flowerbaseApp.currentUser?.logOut().catch(() => undefined)
      } finally {
        syncUser()
        setIsBootstrapping(false)
      }
    }

    void bootstrap()

    return () => {
      flowerbaseApp.removeListener(syncUser)
    }
  }, [syncUser])

  const login = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const nextUser = await flowerbaseApp.logIn(Credentials.emailPassword(email.trim(), password))
      setUser(nextUser)
    } catch (nextError) {
      setError(normalizeError(nextError))
      throw nextError
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      await flowerbaseApp.emailPasswordAuth.registerUser({
        email: email.trim(),
        password
      })
      await login(email, password)
    } catch (nextError) {
      setError(normalizeError(nextError))
      throw nextError
    } finally {
      setIsSubmitting(false)
    }
  }, [login])

  const logout = useCallback(async () => {
    setError(null)
    await flowerbaseApp.currentUser?.logOut()
    setUser(null)
  }, [])

  return {
    user,
    mode,
    error,
    isSubmitting,
    isBootstrapping,
    login,
    register,
    logout,
    setMode
  }
}
