import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import { useCallback, useEffect, useState } from "react";
import { app, db, Realm } from "../../api/client";
import { Loader } from "../../components/Loader";
import { EmptyState } from "../../components/EmptyState";
import { TaskBoard } from "../../components/TaskBoard";
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { NewTask } from "../../components/NewTask";
import { InputSwitch } from 'primereact/inputswitch';
import { TaskTable } from "../../components/TaskTable";
import { Pagination } from "../../components/Pagination";

export interface Todo {
  _id: string;
  userId: number;
  title: string;
  status: "backlog" | "todo" | "progress" | "done";
  createdAt: string
  updatedAt: string
}

export const Home = () => {

  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false);
  const [isKanban, setIsKanban] = useState(true);

  const [pagination, setPagination] = useState<{
    currentPage: number,
    total: number,
    todos: Todo[]
  }>({
    currentPage: 1,
    total: 0,
    todos: []
  })

  const fetchTodos = useCallback(async (page?: number) => {
    try {
      setIsLoading(true)
      const response = await app.currentUser?.functions.searchTodos({ page })
      setPagination((prevPagination) => page ? response : { ...prevPagination, todos: response })
    }
    catch (e) {
      console.log(e)
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await db().collection("todos").deleteOne({ _id: new Realm.BSON.ObjectId(id) })
      setPagination((prevPagination) => ({ ...prevPagination, todos: prevPagination.todos.filter(({ _id }) => _id !== id) }))
    }
    catch (e) {
      console.log(e)
    }
  }, [])

  const handleUpdate = useCallback(async (id: string, newStatus: Todo["status"]) => {
    try {
      await db().collection("todos").updateOne({ _id: new Realm.BSON.ObjectId(id) }, {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
        }
      })
      setPagination((prevPagination) => ({ ...prevPagination, todos: prevPagination.todos.map((task) => task._id !== id ? task : { ...task, status: newStatus }) }))
    }
    catch (e) {
      console.log(e)
    }
  }, [])

  const onChangeMode = useCallback(async (isKanban: boolean) => {
    setIsKanban(isKanban)
    fetchTodos(isKanban ? undefined : 1)
  }, [fetchTodos])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  return (
    <div className="p-6 flex flex-column h-full">
      <div className="flex justify-content-between align-items-center mb-4">
        <h2 className="text-2xl font-semibold">Todo List</h2>

        {!isKanban && <Pagination first={pagination.currentPage} rows={10} totalRecords={pagination.total} onPageChange={(newPage) => fetchTodos(newPage)} />}

        <div className="flex align-items-center gap-3">
          <span>{isKanban ? "Kanban View" : "Table View"}</span>
          <InputSwitch
            checked={isKanban}
            onChange={(e) => onChangeMode(e.value)}
          />
          <Button
            label="Add Task"
            icon="pi pi-plus"
            className="bg-blue-500 text-white border-none hover:bg-blue-600"
            onClick={() => setShowModal(true)}
          />
        </div>
      </div>

      {isLoading ?
        <Loader /> :
        <>
          <Dialog
            header="Create a new Task"
            visible={showModal}
            style={{ width: '30rem' }}
            showHeader={false}
            onHide={() => setShowModal(false)}
            modal
          >
            <NewTask onClose={() => {
              fetchTodos()
              setShowModal(false)
            }} />
          </Dialog>

          {pagination.todos.length > 0 ? (
            isKanban ? (
              <div className="grid grid-nogutter grid-cols-3 gap-4 flex-1 h-full w-full">
                <TaskBoard todos={pagination.todos} onDelete={handleDelete} onChangeStatus={handleUpdate} />
              </div>
            ) : (
              <TaskTable todos={pagination.todos} handleDelete={handleDelete} />
            )
          ) : <EmptyState />}
        </>}
    </div>
  );
}
