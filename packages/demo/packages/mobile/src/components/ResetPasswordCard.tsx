import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

type ResetPasswordCardProps = {
  email: string
  token: string
  tokenId: string
  password: string
  error: string | null
  successMessage: string | null
  isSubmitting: boolean
  onChangeEmail: (value: string) => void
  onChangeToken: (value: string) => void
  onChangeTokenId: (value: string) => void
  onChangePassword: (value: string) => void
  onLoadPreview: () => void
  onRequestReset: () => void
  onSubmitReset: () => void
  onSwitchMode: (mode: 'login' | 'register' | 'reset') => void
}

export const ResetPasswordCard = ({
  email,
  token,
  tokenId,
  password,
  error,
  successMessage,
  isSubmitting,
  onChangeEmail,
  onChangeToken,
  onChangeTokenId,
  onChangePassword,
  onLoadPreview,
  onRequestReset,
  onSubmitReset,
  onSwitchMode
}: ResetPasswordCardProps) => (
  <View style={styles.card}>
    <Text style={styles.title}>Recover password</Text>
    <Text style={styles.body}>
      Demo flow: request a reset, load the preview token from the backend, then confirm the new password.
    </Text>

    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      onChangeText={onChangeEmail}
      placeholder="john@doe.com"
      placeholderTextColor="#8f8477"
      style={styles.input}
      value={email}
    />

    <View style={styles.row}>
      <Pressable onPress={onRequestReset} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{isSubmitting ? 'Working...' : 'Request reset'}</Text>
      </Pressable>
      <Pressable onPress={onLoadPreview} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Load preview</Text>
      </Pressable>
    </View>

    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onChangeToken}
      placeholder="token"
      placeholderTextColor="#8f8477"
      style={styles.input}
      value={token}
    />

    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onChangeTokenId}
      placeholder="tokenId"
      placeholderTextColor="#8f8477"
      style={styles.input}
      value={tokenId}
    />

    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onChangePassword}
      placeholder="new password"
      placeholderTextColor="#8f8477"
      secureTextEntry
      style={styles.input}
      value={password}
    />

    {error ? <Text style={styles.error}>{error}</Text> : null}
    {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

    <Pressable onPress={onSubmitReset} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>Confirm reset</Text>
    </Pressable>

    <Pressable onPress={() => onSwitchMode('login')} style={styles.linkButton}>
      <Text style={styles.linkText}>Back to login</Text>
    </Pressable>
  </View>
)

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
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1f2937'
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#57534e'
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
  row: {
    flexDirection: 'row',
    gap: 10
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0f766e',
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '800'
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#d97706',
    paddingVertical: 16
  },
  primaryButtonText: {
    color: '#fffdf8',
    fontWeight: '800',
    fontSize: 16
  },
  error: {
    color: '#b42318',
    fontSize: 14
  },
  success: {
    color: '#166534',
    fontSize: 14
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 6
  },
  linkText: {
    color: '#0f766e',
    fontWeight: '700'
  }
})
