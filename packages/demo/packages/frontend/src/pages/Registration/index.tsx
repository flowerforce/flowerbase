import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { app } from "../../api/client";

const schema = z
  .object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegistrationData = z.infer<typeof schema>;

export const Registration = () => {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: RegistrationData) => {
    console.log("🚀 ~ onSubmit ~ data:", data);
    try {
      await app.emailPasswordAuth.registerUser({
        email: data.email,
        password: data.password,
      });
    } catch (err) {
      alert("Error during registration");
      console.error(err);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      <Card title="Register" style={{ width: "600px" }}>
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

          <div className="field" style={{ marginBottom: "1rem" }}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <Password
                  id="confirmPassword"
                  {...field}
                  feedback={false}
                  toggleMask
                />
              )}
            />
            {errors.confirmPassword && (
              <small className="p-error">{errors.confirmPassword.message}</small>
            )}
          </div>

          <Button
            type="submit"
            className="p-button-rounded custom-danger-button w-full"
            label={isSubmitting ? "Registering..." : "Register"}
            disabled={isSubmitting}
          />
        </form>
      </Card>
    </div>
  );
};
