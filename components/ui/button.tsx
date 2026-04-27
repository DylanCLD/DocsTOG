import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  asChildCompat?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  asChildCompat = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55",
    variant === "primary" &&
      "border-transparent bg-[var(--accent)] text-[#07110f] hover:bg-[var(--accent-strong)]",
    variant === "secondary" &&
      "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)] hover:bg-[var(--surface-soft)]",
    variant === "ghost" &&
      "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
    variant === "danger" &&
      "border-transparent bg-red-500/15 text-red-300 hover:bg-red-500/25",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-10 px-4 text-sm",
    size === "icon" && "h-10 w-10 p-0",
    className
  );

  if (asChildCompat && React.isValidElement<{ className?: string }>(children)) {
    return React.cloneElement(children, {
      className: cn(classes, children.props.className)
    });
  }

  return (
    <button
      type={type}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}
