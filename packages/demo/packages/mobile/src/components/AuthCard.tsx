import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

type AuthCardProps = {
  mode: 'login' | 'register' | 'reset'
  error: string | null
  isSubmitting: boolean
  onSubmit: (email: string, password: string) => Promise<void>
  onSwitchMode: (mode: 'login' | 'register' | 'reset') => void
}

export const AuthCard = ({ mode, error, isSubmitting, onSubmit, onSwitchMode }: AuthCardProps) => {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const handleSubmit = () => {
    void onSubmit(email, password)
  }

  return (
    <View style={styles.card}>
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => onSwitchMode('login')}
          style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeButtonText, mode === 'login' && styles.modeButtonTextActive]}>Login</Text>
        </Pressable>
        <Pressable
          onPress={() => onSwitchMode('register')}
          style={[styles.modeButton, mode === 'register' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeButtonText, mode === 'register' && styles.modeButtonTextActive]}>Register</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Email</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="john@doe.com"
        placeholderTextColor="#8f8477"
        style={styles.input}
        value={email}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setPassword}
        placeholder="secret123"
        placeholderTextColor="#8f8477"
        secureTextEntry
        style={styles.input}
        value={password}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={handleSubmit} style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}>
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Working...' : mode === 'login' ? 'Access demo' : 'Create account'}
        </Text>
      </Pressable>

      {mode === 'login' ? (
        <Pressable onPress={() => onSwitchMode('reset')} style={styles.linkButton}>
          <Text style={styles.linkText}>Forgot password?</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#fff9f2',
    gap: 12,
    borderWidth: 1,
    borderColor: '#d9ccb8'
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#efe3d1',
    borderRadius: 16,
    padding: 4,
    marginBottom: 8
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12
  },
  modeButtonActive: {
    backgroundColor: '#0f766e'
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5a4d3c'
  },
  modeButtonTextActive: {
    color: '#f8fffd'
  },
  label: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#4b4035'
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d5c6b3',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1d1a16'
  },
  error: {
    color: '#b42318',
    fontSize: 14,
    marginTop: 4
  },
  submitButton: {
    marginTop: 8,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#d97706',
    paddingVertical: 16
  },
  submitButtonDisabled: {
    opacity: 0.7
  },
  submitButtonText: {
    color: '#fffdf8',
    fontWeight: '800',
    fontSize: 16
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 4
  },
  linkText: {
    color: '#0f766e',
    fontWeight: '700'
  }
})
