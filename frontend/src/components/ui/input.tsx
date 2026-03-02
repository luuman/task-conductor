// frontend/src/components/ui/input.tsx
import { cn } from "../../lib/utils";
import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app",
        "placeholder:text-app-tertiary outline-none",
        "focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
