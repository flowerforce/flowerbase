import { Button } from "primereact/button";

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  icon?: string;
  buttonLabel?: string;
  onButtonClick?: () => void;
}

export const EmptyState = ({
  title = "No content available",
  subtitle = "There are no items to display at the moment.",
  icon = "pi pi-inbox",
  buttonLabel,
  onButtonClick,
}: EmptyStateProps) => {
  return (
    <div className="empty-state-container">
      <i className={`empty-state-icon ${icon}`} />
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-subtitle">{subtitle}</p>
      {buttonLabel && onButtonClick && (
        <Button
          label={buttonLabel}
          icon="pi pi-plus"
          className="p-button-outlined p-button-sm mt-3"
          onClick={onButtonClick}
        />
      )}
    </div>
  );
};
