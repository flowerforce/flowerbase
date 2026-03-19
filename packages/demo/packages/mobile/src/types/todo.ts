export type TodoStatus = 'backlog' | 'todo' | 'progress' | 'done'

export type TodoItem = {
  id: string
  title: string
  status: TodoStatus
  secureNote?: string
  createdAt?: string
  updatedAt?: string
}

export type TodoDraft = {
  title: string
  status: TodoStatus
  secureNote: string
}
