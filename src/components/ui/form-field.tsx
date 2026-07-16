"use client";

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  type?: string;
  textarea?: boolean;
  required?: boolean;
  rows?: number;
}

const FIELD_CLASSES =
  "peer w-full border border-ink/20 bg-transparent px-6 pt-6 pb-2 text-base text-ink outline-none transition-colors duration-300 focus:border-ink/60";
const LABEL_CLASSES =
  "pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-on-light text-base text-ink/50 transition-all duration-300 ease-default peer-focus:top-4 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:text-xs";

export default function FormField({
  id,
  name,
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
  required = false,
  rows = 5,
}: FormFieldProps) {
  return (
    <div className="relative">
      {textarea ? (
        <textarea
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          rows={rows}
          placeholder=" "
          className={`${FIELD_CLASSES} rounded-chip`}
        />
      ) : (
        <input
          type={type}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder=" "
          className={`${FIELD_CLASSES} rounded-full`}
        />
      )}
      <label
        htmlFor={id}
        className={`${LABEL_CLASSES} ${textarea ? "top-7" : ""}`}
      >
        {label}
        {required ? " *" : ""}
      </label>
    </div>
  );
}
