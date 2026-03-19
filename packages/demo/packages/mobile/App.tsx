import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { AuthView } from './src/views/AuthView'
import { ResetPasswordView } from './src/views/ResetPasswordView'
import { TodosView } from './src/views/TodosView'
import { usePasswordReset } from './src/hooks/usePasswordReset'
import { useSession } from './src/hooks/useSession'
import { useTodos } from './src/hooks/useTodos'

export default function App() {
  const session = useSession()
  const passwordReset = usePasswordReset()
  const todos = useTodos(session.user?.id ?? null)

  if (session.isBootstrapping) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.bootText}>Restoring Flowerbase session...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      {session.user ? (
        <TodosView session={session} todos={todos} />
      ) : session.mode === 'reset' ? (
        <ResetPasswordView
          mode={session.mode}
          onSwitchMode={session.setMode}
          passwordReset={passwordReset}
        />
      ) : (
        <AuthView
          mode={session.mode}
          error={session.error}
          isSubmitting={session.isSubmitting}
          onLogin={session.login}
          onRegister={session.register}
          onSwitchMode={session.setMode}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4efe6'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24
  },
  bootText: {
    fontSize: 16,
    color: '#3f3a34'
  }
})
