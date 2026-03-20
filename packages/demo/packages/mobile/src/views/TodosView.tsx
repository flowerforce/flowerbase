import { Pressable, StyleSheet, Text, View } from 'react-native'
import { mobileDemoConfig } from '../config/env'
import { TodoComposer } from '../components/TodoComposer'
import { TodoList } from '../components/TodoList'
import type { useSession } from '../hooks/useSession'
import type { useTodos } from '../hooks/useTodos'

type TodosViewProps = {
  session: ReturnType<typeof useSession>
  todos: ReturnType<typeof useTodos>
}

export const TodosView = ({ session, todos }: TodosViewProps) => (
  <View style={styles.container}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Todo control room</Text>
        <Text style={styles.subtitle}>
          {session.user?.profile?.email ?? session.user?.id} on {mobileDemoConfig.databaseName}
        </Text>
      </View>
      <Pressable onPress={() => void session.logout()} style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </Pressable>
    </View>

    {todos.error ? <Text style={styles.error}>{todos.error}</Text> : null}

    <TodoComposer
      draft={todos.draft}
      editingId={todos.editingId}
      isSaving={todos.isSaving}
      onCancel={todos.cancelEditing}
      onChange={todos.setDraft}
      onSave={() => void todos.saveTodo()}
    />

    <TodoList
      isLoading={todos.isLoading}
      todos={todos.todos}
      onDelete={(id) => void todos.removeTodo(id)}
      onEdit={todos.startEditing}
      onRefresh={() => void todos.loadTodos()}
      onRotateStatus={(id, status) => void todos.updateStatus(id, status)}
    />
  </View>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  headerCopy: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#111827'
  },
  subtitle: {
    fontSize: 14,
    color: '#57534e'
  },
  logoutButton: {
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  logoutButtonText: {
    color: '#f9fafb',
    fontWeight: '800'
  },
  error: {
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    paddingHorizontal: 14,
    paddingVertical: 12
  }
})
