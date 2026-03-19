import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { TodoRow } from './TodoRow'
import type { TodoItem, TodoStatus } from '../types/todo'

type TodoListProps = {
  todos: TodoItem[]
  isLoading: boolean
  onDelete: (id: string) => void
  onEdit: (todo: TodoItem) => void
  onRefresh: () => void
  onRotateStatus: (id: string, status: TodoStatus) => void
}

export const TodoList = ({
  todos,
  isLoading,
  onDelete,
  onEdit,
  onRefresh,
  onRotateStatus
}: TodoListProps) => (
  <ScrollView
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0f766e" />}
  >
    {isLoading && todos.length === 0 ? (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    ) : null}

    {!isLoading && todos.length === 0 ? (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No todos yet</Text>
        <Text style={styles.emptyText}>Create the first item and verify CRUD from Expo against Flowerbase.</Text>
      </View>
    ) : null}

    {todos.map((todo) => (
      <TodoRow key={todo.id} todo={todo} onDelete={onDelete} onEdit={onEdit} onRotateStatus={onRotateStatus} />
    ))}
  </ScrollView>
)

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 36
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: '#fff7ed',
    padding: 24,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#9a3412',
    marginBottom: 8
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7c2d12'
  }
})
