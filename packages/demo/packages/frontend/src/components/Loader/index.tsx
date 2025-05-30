// Loader.tsx
import { ProgressSpinner } from "primereact/progressspinner";
export const Loader = ({ message = "Caricamento..." }: { message?: string }) => {
  return (
    <div className="loader-container">
      <ProgressSpinner style={{ width: "50px", height: "50px" }} strokeWidth="4" />
      <p className="loader-message">{message}</p>
    </div>
  );
}
