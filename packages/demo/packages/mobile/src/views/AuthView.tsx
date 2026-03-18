import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { mobileDemoConfig } from '../config/env'
import { AuthCard } from '../components/AuthCard'

type AuthViewProps = {
  mode: 'login' | 'register' | 'reset'
  error: string | null
  isSubmitting: boolean
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string) => Promise<void>
  onSwitchMode: (mode: 'login' | 'register' | 'reset') => void
}

export const AuthView = ({
  mode,
  error,
  isSubmitting,
  onLogin,
  onRegister,
  onSwitchMode
}: AuthViewProps) => (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    style={styles.container}
  >
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>Flowerbase mobile demo</Text>
      <Text style={styles.title}>Expo app for login and todo CRUD</Text>
      <Text style={styles.subtitle}>
        Connected to `{mobileDemoConfig.appId}` on `{mobileDemoConfig.baseUrl}`.
      </Text>
    </View>

    <AuthCard
      error={error}
      isSubmitting={isSubmitting}
      mode={mode}
      onSubmit={mode === 'login' ? onLogin : onRegister}
      onSwitchMode={onSwitchMode}
    />
  </KeyboardAvoidingView>
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
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    color: '#1f2937'
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#57534e'
  }
})
