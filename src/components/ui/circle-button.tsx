interface CircleButtonProps {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}

export default function CircleButton({
  children,
  label,
  onClick,
  className = "",
}: CircleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-14 items-center justify-center rounded-full border border-cream/15 text-cream transition-colors duration-300 ease-default hover:bg-island hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}
