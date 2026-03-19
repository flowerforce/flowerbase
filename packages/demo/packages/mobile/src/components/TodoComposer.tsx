import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TodoDraft, TodoStatus } from '../types/todo'

const statuses: TodoStatus[] = ['backlog', 'todo', 'progress', 'done']

type TodoComposerProps = {
  draft: TodoDraft
  editingId: string | null
  isSaving: boolean
  onCancel: () => void
  onChange: (draft: TodoDraft) => void
  onSave: () => void
}

export const TodoComposer = ({ draft, editingId, isSaving, onCancel, onChange, onSave }: TodoComposerProps) => (
  <View style={styles.card}>
    <Text style={styles.title}>{editingId ? 'Update todo' : 'Create todo'}</Text>

    <TextInput
      onChangeText={(value) => onChange({ ...draft, title: value })}
      placeholder="Ship Expo demo"
      placeholderTextColor="#8b8d92"
      style={styles.input}
      value={draft.title}
    />

    <TextInput
      multiline
      numberOfLines={3}
      onChangeText={(value) => onChange({ ...draft, secureNote: value })}
      placeholder="Private note stored in secureNote"
      placeholderTextColor="#8b8d92"
      style={[styles.input, styles.textarea]}
      textAlignVertical="top"
      value={draft.secureNote}
    />

    <View style={styles.statusRow}>
      {statuses.map((status) => (
        <Pressable
          key={status}
          onPress={() => onChange({ ...draft, status })}
          style={[styles.statusChip, draft.status === status && styles.statusChipActive]}
        >
          <Text style={[styles.statusChipText, draft.status === status && styles.statusChipTextActive]}>
            {status}
          </Text>
        </Pressable>
      ))}
    </View>

    <View style={styles.actionRow}>
      {editingId ? (
        <Pressable onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onSave} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add todo'}</Text>
      </Pressable>
    </View>
  </View>
)

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: '#f8fafc',
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#d9e2ec'
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#111827',
    fontSize: 16
  },
  textarea: {
    minHeight: 96
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff'
  },
  statusChipActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1'
  },
  statusChipText: {
    color: '#475569',
    fontWeight: '700'
  },
  statusChipTextActive: {
    color: '#115e59'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700'
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#0f766e',
    paddingVertical: 14
  },
  primaryButtonText: {
    color: '#f0fdfa',
    fontSize: 15,
    fontWeight: '800'
  }
})
