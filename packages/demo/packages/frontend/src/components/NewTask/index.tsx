import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Button } from "primereact/button";
import { useCallback } from "react";
import { app, db } from "../../api/client";

const TaskSchema = z.object({
    title: z.string().min(3, "Title is required"),
    status: z.string().nonempty("Status is required"),
});

type TaskFormData = z.infer<typeof TaskSchema>;

const statusOptions = [
    { label: "Backlog", value: "backlog" },
    { label: "To Do", value: "todo" },
    { label: "In Progress", value: "progress" },
    { label: "Done", value: "done" },
];

type NewTaskProps = {
    onClose: () => void
}

export const NewTask = ({ onClose }: NewTaskProps) => {
    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
        watch,
    } = useForm<TaskFormData>({
        resolver: zodResolver(TaskSchema),
        defaultValues: {
            title: "",
            status: "backlog",
        },
    });

    const onSubmit = useCallback(async (data: TaskFormData) => {
        try {
            await db().collection("todos").insertOne({
                ...data,
                userId: app.currentUser!.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            onClose();
        } catch (e) {
            console.log(e);
            alert("An error occurred");
        }
    }, [onClose]);

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-column gap-3 justify-content-between">
            <div className="flex flex-column">
                <h2 className="font-bold mb-2">Add Task</h2>
                <label htmlFor="title" className="font-bold mb-2">
                    Title
                </label>
                <InputText
                    id="title"
                    {...register("title")}
                    className={errors.title ? "p-invalid" : ""}
                    aria-invalid={errors.title ? "true" : "false"}
                    placeholder="Enter task title"
                />
                {errors.title && (
                    <small className="p-error">{errors.title.message}</small>
                )}
            </div>

            <div className="flex flex-column">
                <label htmlFor="status" className="font-bold mb-2">
                    Status
                </label>
                <Dropdown
                    id="status"
                    value={watch("status")}
                    options={statusOptions}
                    onChange={(e) => setValue("status", e.value)}
                    placeholder="Select a status"
                    className={errors.status ? "p-invalid" : ""}
                />
                {errors.status && (
                    <small className="p-error">{errors.status.message}</small>
                )}
            </div>

            <div className="flex gap-2">
                <Button
                    label="Cancel"
                    className="flex-1"
                    type="button"
                    style={{ color: "#FFF", backgroundColor: "grey" }}
                    onClick={onClose}
                />
                <Button
                    label="Save"
                    type="submit"
                    className="p-button-rounded custom-danger-button flex-1"
                />
            </div>
        </form>
    );
};
