import { Card } from "primereact/card";
import { Todo } from "../../pages/Home";
import { Tag, TagProps } from "primereact/tag";
import { Button } from "primereact/button";
import { useCallback, useRef, useState } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import { Menu } from "primereact/menu";
import { MenuItem } from "primereact/menuitem";

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
        ? COLUMN_ORDER[index + 1]
        : null;
};

const getPrevStatus = (currentStatus: Todo["status"]) => {
    const index = COLUMN_ORDER.indexOf(currentStatus);
    return index > 0
        ? COLUMN_ORDER[index - 1]
        : null;
};

type TaskBoardProps = {
    todos: Todo[];
    onDelete: (id: string) => void;
    onChangeStatus: (id: string, newStatus: Todo["status"]) => void;
};

export const TaskBoard = ({
    todos,
    onDelete,
    onChangeStatus,
}: TaskBoardProps) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleDragStart = useCallback((id: string) => {
        setDraggedId(id);
    }, [])

    const handleDrop = useCallback((newStatus: Todo["status"]) => {
        if (!draggedId) return;
        const todo = todos.find((t) => t._id === draggedId);
        if (todo && todo.status !== newStatus) {
            onChangeStatus(draggedId, newStatus);
        }
        setDraggedId(null);
    }, [draggedId, onChangeStatus, todos])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, [])

    const tasksByStatus = useCallback((status: string) =>
        todos.filter((task) => task.status === status), [todos]);


    const menuRef = useRef<OverlayPanel>(null);

    return (
        <div className="surface-ground w-full overflow-hidden h-full">
            <div className="flex gap-4 w-full h-full">
                {COLUMN_ORDER.map((status) => (
                    <div
                        key={status}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(status)}
                        className="flex flex-column surface-card border-round shadow-2 overflow-y-hidden flex-1 h-full"
                        style={{ minWidth: 250 }}
                    >
                        <Tag
                            value={COLUMN_TITLES[status]}
                            className="text-xl text-center w-full justify-content-center mb-3"
                            severity={
                                COLUMN_TITLES_COLORS[status] as TagProps["severity"]
                            }
                        />
                        <div className="flex flex-column overflow-y-scroll pb-4">
                            {tasksByStatus(status).map((todo) => (
                                <div
                                    key={todo._id}
                                    className="col mb-3 cursor-pointer"
                                    draggable
                                    onDragStart={() => handleDragStart(todo._id)}
                                >
                                    <Card
                                        title={
                                            <div className="flex justify-content-between align-items-start">
                                                <span>{todo.title}</span>
                                                <Button
                                                    icon="pi pi-ellipsis-v"
                                                    severity="secondary" text
                                                    onClick={(e) => menuRef.current?.toggle(e)}
                                                    style={{
                                                        width: 0,
                                                        height: 20,
                                                    }}
                                                />
                                                <OverlayPanel ref={menuRef}>
                                                    <Menu model={[
                                                        {
                                                            label: "Delete",
                                                            icon: "pi pi-trash",
                                                            command: () => {
                                                                onDelete(todo._id);
                                                                menuRef.current?.hide();
                                                            },
                                                        },
                                                        getPrevStatus(status) ? ({
                                                            label: `Back to ${getPrevStatus(status)}`,
                                                            icon: "pi pi-arrow-left",
                                                            command: () => {
                                                                onChangeStatus(todo._id, getPrevStatus(status) as Todo["status"])
                                                                menuRef.current?.hide();
                                                            },
                                                        }) : null,
                                                        getNextStatus(status) ? ({
                                                            label: `Move to ${getNextStatus(status)}`,
                                                            icon: "pi pi-arrow-right",
                                                            command: () => {
                                                                onChangeStatus(todo._id, getNextStatus(status) as Todo["status"])
                                                                menuRef.current?.hide();
                                                            },
                                                        }) : null,

                                                    ].filter(Boolean) as MenuItem[]} />
                                                </OverlayPanel>
                                            </div>
                                        }
                                        subTitle={`Created on: ${new Date(todo.createdAt).toLocaleDateString()}`}
                                        className="shadow-md"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
