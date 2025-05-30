import { Card } from "primereact/card";
import { Todo } from "../../pages/Home";
import { Tag, TagProps } from "primereact/tag";
import { Button } from "primereact/button";

const COLUMN_TITLES = {
    backlog: "Backlog",
    todo: "To Do",
    progress: "In Progress",
    done: "Done",
};

const COLUMN_TITLES_COLORS = {
  backlog: "danger",   
  todo: "warning",     
  progress: "info",    
  done: "success",    
} as const;

const COLUMN_ORDER = ["backlog", "todo", "progress", "done"] as Todo["status"][];

const getNextStatus = (currentStatus: Todo["status"]) => {
    const index = COLUMN_ORDER.indexOf(currentStatus);
    return index >= 0 && index < COLUMN_ORDER.length - 1
        ? COLUMN_ORDER[index + 1] as Todo["status"]
        : null;
};

const getPrevStatus = (currentStatus: Todo["status"]) => {
    const index = COLUMN_ORDER.indexOf(currentStatus);
    return index > 0
        ? COLUMN_ORDER[index - 1] as Todo["status"]
        : null;
};

type TaskBoardProps = {
    todos: Todo[]
    onDelete: (id: string) => void
    onChangeStatus: (id: string, newStatus: Todo["status"]) => void
}

export const TaskBoard = ({
    todos,
    onDelete,
    onChangeStatus
}: TaskBoardProps) => {
    const tasksByStatus = (status: string) =>
        todos.filter((task) => task.status === status);

    return (
        <div className="surface-ground w-full overflow-hidden h-full">
            <div className="flex gap-4 w-full h-full">
                {COLUMN_ORDER.map((status) => (
                    <div
                        key={status}
                        className="flex flex-column surface-card border-round shadow-2 overflow-y-hidden flex-1 h-full"
                    >
                        <Tag
                            value={COLUMN_TITLES[status as keyof typeof COLUMN_TITLES]}
                            className="text-xl text-center w-full justify-content-center mb-3"
                            severity={
                                COLUMN_TITLES_COLORS[status as keyof typeof COLUMN_TITLES] as TagProps["severity"]
                            }
                        />
                        <div className="flex flex-column overflow-y-scroll pb-4">
                            {tasksByStatus(status).map((todo) => (
                                <div key={todo._id} className="col mb-3">
                                    <Card
                                        title={
                                            <div className="flex justify-content-between align-items-start">
                                                <span>{todo.title}</span>
                                                <Button
                                                    icon="pi pi-trash"
                                                    className="p-button-rounded custom-danger-button"
                                                    onClick={() => onDelete(todo._id)}
                                                    style={{
                                                        width: 10,
                                                        height: 20
                                                    }}
                                                />
                                            </div>
                                        }
                                        subTitle={`Created on: ${new Date(todo.createdAt).toLocaleDateString()}`}
                                        className="shadow-md"
                                    >
                                        <div className="flex align-items-center justify-content-between mt-2">
                                            {getPrevStatus(status) && (
                                                <button
                                                    onClick={() => onChangeStatus(todo._id, getPrevStatus(status) as Todo["status"])}
                                                    style={{
                                                        backgroundColor: "#6ef27e",
                                                        color: "#121212",
                                                        border: "none",
                                                        borderRadius: "8px",
                                                        cursor: "pointer",
                                                        fontWeight: "600",
                                                        padding: "0.5rem 1rem"
                                                    }}
                                                >
                                                    {`Back to ${getPrevStatus(status)}`}
                                                </button>
                                            )}
                                            {getNextStatus(status) && (
                                                <button
                                                    onClick={() => onChangeStatus(todo._id, getNextStatus(status) as Todo["status"])}
                                                    style={{
                                                        backgroundColor: "#3CB6D4",
                                                        color: "#121212",
                                                        border: "none",
                                                        borderRadius: "8px",
                                                        cursor: "pointer",
                                                        fontWeight: "600",
                                                        padding: "0.5rem 1rem"
                                                    }}
                                                >
                                                    {`Move to ${getNextStatus(status)}`}
                                                </button>
                                            )}
                                        </div>
                                    </Card>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
