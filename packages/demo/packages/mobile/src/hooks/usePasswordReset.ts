import { useCallback, useState } from 'react'
import { flowerbaseApp } from '../api/client'
import { mobileDemoConfig } from '../config/env'

type ResetPreview = {
  token: string
  tokenId: string
}

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected Flowerbase error'
}

export const usePasswordReset = () => {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccessMessage(null)
  }, [])

  const requestReset = useCallback(async () => {
    if (!email.trim()) {
      setError('Email is required')
      return
    }

    setIsSubmitting(true)
    clearMessages()

    try {
      await flowerbaseApp.emailPasswordAuth.sendResetPasswordEmail(email.trim())
      setSuccessMessage('Reset request created. Load the demo preview to get token and tokenId.')
    } catch (nextError) {
      setError(normalizeError(nextError))
    } finally {
      setIsSubmitting(false)
    }
  }, [clearMessages, email])

  const loadPreview = useCallback(async () => {
    if (!email.trim()) {
      setError('Email is required')
      return
    }

    setIsSubmitting(true)
    clearMessages()

    try {
      const response = await fetch(
        `${mobileDemoConfig.baseUrl}/app/${mobileDemoConfig.appId}/endpoint/demo-reset-preview?email=${encodeURIComponent(email.trim())}`
      )
      const payload = (await response.json()) as Partial<ResetPreview> & { message?: string }

      if (!response.ok || typeof payload.token !== 'string' || typeof payload.tokenId !== 'string') {
        throw new Error(payload.message || 'Reset preview not available')
      }

      setToken(payload.token)
      setTokenId(payload.tokenId)
      setSuccessMessage('Reset preview loaded from demo backend.')
    } catch (nextError) {
      setError(normalizeError(nextError))
    } finally {
      setIsSubmitting(false)
    }
  }, [clearMessages, email])

  const confirmReset = useCallback(async () => {
    if (!token.trim() || !tokenId.trim() || !password.trim()) {
      setError('Token, tokenId and new password are required')
      return false
    }

    setIsSubmitting(true)
    clearMessages()

    try {
      await flowerbaseApp.emailPasswordAuth.resetPassword({
        token: token.trim(),
        tokenId: tokenId.trim(),
        password
      })
      setSuccessMessage('Password updated. You can now log in with the new password.')
      return true
    } catch (nextError) {
      console.log("🚀 ~ usePasswordReset ~ normalizeError(nextError):", normalizeError(nextError))
      setError(normalizeError(nextError))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [clearMessages, password, token, tokenId])

  return {
    email,
    token,
    tokenId,
    password,
    error,
    successMessage,
    isSubmitting,
    setEmail,
    setToken,
    setTokenId,
    setPassword,
    requestReset,
    loadPreview,
    confirmReset,
    clearMessages
  }
}
