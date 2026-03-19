import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { TodoItem, TodoStatus } from '../types/todo'

const nextStatus: Record<TodoStatus, TodoStatus> = {
  backlog: 'todo',
  todo: 'progress',
  progress: 'done',
  done: 'backlog'
}

type TodoRowProps = {
  todo: TodoItem
  onDelete: (id: string) => void
  onEdit: (todo: TodoItem) => void
  onRotateStatus: (id: string, status: TodoStatus) => void
}

export const TodoRow = ({ todo, onDelete, onEdit, onRotateStatus }: TodoRowProps) => (
  <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.title}>{todo.title}</Text>
        <Text style={styles.meta}>Status: {todo.status}</Text>
      </View>
      <Pressable onPress={() => onRotateStatus(todo.id, nextStatus[todo.status])} style={styles.statusButton}>
        <Text style={styles.statusButtonText}>Next</Text>
      </Pressable>
    </View>

    {todo.secureNote ? <Text style={styles.note}>{todo.secureNote}</Text> : null}

    <View style={styles.actions}>
      <Pressable onPress={() => onEdit(todo)} style={styles.editButton}>
        <Text style={styles.editButtonText}>Edit</Text>
      </Pressable>
      <Pressable onPress={() => onDelete(todo.id)} style={styles.deleteButton}>
        <Text style={styles.deleteButtonText}>Delete</Text>
      </Pressable>
    </View>
  </View>
)

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  copy: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827'
  },
  meta: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'uppercase'
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155'
  },
  statusButton: {
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  statusButtonText: {
    color: '#166534',
    fontWeight: '800'
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  editButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    paddingVertical: 12
  },
  editButtonText: {
    color: '#075985',
    fontWeight: '800'
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    paddingVertical: 12
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontWeight: '800'
  }
})
