// frontend/src/components/ui/button.tsx
import { cn } from "../../lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium transition-colors rounded-md cursor-pointer",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variant === "default" && "bg-accent hover:bg-accent-hover text-white",
          variant === "ghost" && "hover:bg-app-tertiary text-app-secondary hover:text-app",
          variant === "outline" && "border border-app hover:bg-app-tertiary text-app",
          variant === "danger" && "bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40",
          size === "sm" && "text-xs px-2 py-1 h-6",
          size === "md" && "text-xs px-3 py-1.5 h-7",
          size === "lg" && "text-sm px-4 py-2 h-9",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
