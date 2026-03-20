import { StyleSheet, Text, View } from 'react-native'
import { ResetPasswordCard } from '../components/ResetPasswordCard'
import { mobileDemoConfig } from '../config/env'
import type { usePasswordReset } from '../hooks/usePasswordReset'

type ResetPasswordViewProps = {
  mode: 'login' | 'register' | 'reset'
  onSwitchMode: (mode: 'login' | 'register' | 'reset') => void
  passwordReset: ReturnType<typeof usePasswordReset>
}

export const ResetPasswordView = ({ mode, onSwitchMode, passwordReset }: ResetPasswordViewProps) => (
  <View style={styles.container}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>Flowerbase password reset</Text>
      <Text style={styles.title}>Demo recovery flow for Expo</Text>
      <Text style={styles.subtitle}>
        Preview tokens are exposed by the demo backend on `{mobileDemoConfig.baseUrl}` only for local testing.
      </Text>
    </View>

    <ResetPasswordCard
      email={passwordReset.email}
      token={passwordReset.token}
      tokenId={passwordReset.tokenId}
      password={passwordReset.password}
      error={passwordReset.error}
      successMessage={passwordReset.successMessage}
      isSubmitting={passwordReset.isSubmitting}
      onChangeEmail={passwordReset.setEmail}
      onChangeToken={passwordReset.setToken}
      onChangeTokenId={passwordReset.setTokenId}
      onChangePassword={passwordReset.setPassword}
      onLoadPreview={() => void passwordReset.loadPreview()}
      onRequestReset={() => void passwordReset.requestReset()}
      onSubmitReset={() => void passwordReset.confirmReset()}
      onSwitchMode={onSwitchMode}
    />
  </View>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 24
  },
  hero: {
    gap: 10
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#1f2937'
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#57534e'
  }
})
