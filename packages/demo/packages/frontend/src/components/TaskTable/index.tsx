import { Button } from "primereact/button"
import { Todo } from "../../pages/Home"
import { DataTable } from "primereact/datatable"
import { Column } from "primereact/column"
import { Tag } from "primereact/tag"

type TaskTableProps = {
    todos: Todo[]
    handleDelete: (taskId: string) => void
}

const COLUMN_TITLES_COLORS = {
  backlog: "danger",   
  todo: "warning",     
  progress: "info",    
  done: "success",    
} as const;

export const TaskTable = ({ todos, handleDelete }: TaskTableProps) => {
    const statusTemplate = (rowData: Todo) => {
        const severity = COLUMN_TITLES_COLORS[rowData.status];
        return <Tag value={rowData.status} severity={severity} />;
    };

    return <DataTable className="w-full overflow-y-scroll flex-1" value={todos} tableStyle={{ width: '100%',}} responsiveLayout="scroll">
        <Column field="title" header="Title" />
        <Column field="status" header="Status" body={statusTemplate} />
        <Column
            field="createdAt"
            header="Created At"
            body={(rowData) => new Date(rowData.createdAt).toLocaleString()}
        />
        <Column
            field="updatedAt"
            header="Updated At"
            body={(rowData) => new Date(rowData.updatedAt).toLocaleString()}
        />
        <Column
            header="Actions"
            body={(rowData) => (
                <Button
                    icon="pi pi-trash"
                    className="p-button-rounded p-button-danger p-button-text"
                    onClick={() => handleDelete(rowData._id)}
                />
            )}
        />
    </DataTable>
}
