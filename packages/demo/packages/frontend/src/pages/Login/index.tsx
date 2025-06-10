import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { APP_ROUTES } from "../../appRoutes";
import { useCallback } from "react";
import { useAuthentication } from "../../hooks/useAuthentication";

const loginSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginData = z.infer<typeof loginSchema>;

export const Login = () => {
    const { login } = useAuthentication();
    const {
        control,
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginData>({
        resolver: zodResolver(loginSchema),
    });

    const navigate = useNavigate();

    const onSubmit = useCallback(async (data: LoginData) => {
        try {
            await login(data.email, data.password);
            navigate(APP_ROUTES.HOME);
        } catch (err) {
            alert("Incorrect credentials or login error");
            console.error(err);
        }
    }, [login, navigate]);

    return (
        <div
            style={{
                display: "flex",
                height: "100%",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "column",
            }}
        >
            <Card title="Login" style={{ width: "600px" }}>
                <form onSubmit={handleSubmit(onSubmit)} className="p-fluid">
                    <div className="field" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="email">Email</label>
                        <InputText id="email" {...register("email")} />
                        {errors.email && (
                            <small className="p-error">{errors.email.message}</small>
                        )}
                    </div>

                    <div className="field" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="password">Password</label>
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <Password
                                    id="password"
                                    {...field}
                                    feedback={false}
                                    toggleMask
                                />
                            )}
                        />
                        {errors.password && (
                            <small className="p-error">{errors.password.message}</small>
                        )}
                    </div>

                    <Button
                        type="submit"
                        label={isSubmitting ? "Logging in..." : "Login"}
                        className="p-button-rounded custom-danger-button w-full"
                        disabled={isSubmitting}
                    />
                </form>
            </Card>

            <div style={{ marginTop: "1rem" }}>
                <span>Not registered? </span>
                <button
                    type="button"
                    onClick={() => navigate(APP_ROUTES.REGISTRATION)}
                    style={{
                        background: "none",
                        border: "none",
                        color: "#007ad9",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                        fontSize: "1rem",
                    }}
                >
                    Register now
                </button>
                .
            </div>
        </div>
    );
};
