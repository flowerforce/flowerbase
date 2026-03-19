import { useCallback, useEffect, useState } from 'react'
import { BSON, getTodosCollection } from '../api/client'
import type { TodoDraft, TodoItem, TodoStatus } from '../types/todo'

const emptyDraft: TodoDraft = {
  title: '',
  status: 'todo',
  secureNote: ''
}

const normalizeTodo = (value: Record<string, unknown>): TodoItem => ({
  id: typeof value._id === 'string' ? value._id : String(value._id),
  title: typeof value.title === 'string' ? value.title : 'Untitled todo',
  status:
    value.status === 'backlog' || value.status === 'progress' || value.status === 'done' ? value.status : 'todo',
  secureNote: typeof value.secureNote === 'string' ? value.secureNote : undefined,
  createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : undefined,
  updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : undefined
})

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected Flowerbase error'
}

export const useTodos = (userId: string | null) => {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [draft, setDraft] = useState<TodoDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTodos = useCallback(async () => {
    if (!userId) {
      setTodos([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const results = await getTodosCollection().find({}, { sort: { createdAt: -1 } })
      const normalized = Array.isArray(results)
        ? results
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map(normalizeTodo)
        : []
      setTodos(normalized)
    } catch (nextError) {
      setError(normalizeError(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setDraft(emptyDraft)
    setEditingId(null)
    void loadTodos()
  }, [loadTodos])

  const saveTodo = useCallback(async () => {
    if (!userId) return

    const trimmedTitle = draft.title.trim()
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        title: trimmedTitle,
        status: draft.status,
        userId,
        updatedAt: new Date(),
        ...(draft.secureNote.trim() ? { secureNote: draft.secureNote.trim() } : {})
      }

      if (editingId) {
        await getTodosCollection().updateOne(
          { _id: new BSON.ObjectId(editingId) },
          {
            $set: payload
          }
        )
      } else {
        await getTodosCollection().insertOne({
          ...payload,
          createdAt: new Date()
        })
      }

      setDraft(emptyDraft)
      setEditingId(null)
      await loadTodos()
    } catch (nextError) {
      setError(normalizeError(nextError))
    } finally {
      setIsSaving(false)
    }
  }, [draft, editingId, loadTodos, userId])

  const removeTodo = useCallback(async (id: string) => {
    setError(null)

    try {
      await getTodosCollection().deleteOne({ _id: new BSON.ObjectId(id) })
      if (editingId === id) {
        setEditingId(null)
        setDraft(emptyDraft)
      }
      await loadTodos()
    } catch (nextError) {
      setError(normalizeError(nextError))
    }
  }, [editingId, loadTodos])

  const updateStatus = useCallback(async (id: string, status: TodoStatus) => {
    setError(null)

    try {
      await getTodosCollection().updateOne(
        { _id: new BSON.ObjectId(id) },
        {
          $set: {
            status,
            updatedAt: new Date()
          }
        }
      )
      await loadTodos()
    } catch (nextError) {
      setError(normalizeError(nextError))
    }
  }, [loadTodos])

  const startEditing = useCallback((todo: TodoItem) => {
    setEditingId(todo.id)
    setDraft({
      title: todo.title,
      status: todo.status,
      secureNote: todo.secureNote ?? ''
    })
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingId(null)
    setDraft(emptyDraft)
  }, [])

  return {
    todos,
    draft,
    editingId,
    isLoading,
    isSaving,
    error,
    setDraft,
    loadTodos,
    saveTodo,
    removeTodo,
    updateStatus,
    startEditing,
    cancelEditing
  }
}
