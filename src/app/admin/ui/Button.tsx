import type { ButtonHTMLAttributes } from "react";
import { buttonClass, ButtonSize, ButtonVariant } from "./styles";

// A button of the staff look. `type` defaults to "button": none of the
// staff pages submits a form.
export default function Button({
  variant,
  size,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`${buttonClass({ variant, size })} ${className}`}
      {...rest}
    />
  );
}
