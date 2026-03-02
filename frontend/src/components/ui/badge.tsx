// frontend/src/components/ui/badge.tsx
import { cn } from "../../lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "accent";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
      variant === "default" && "bg-app-tertiary text-app-secondary",
      variant === "success" && "bg-green-900/30 text-green-400",
      variant === "warning" && "bg-yellow-900/30 text-yellow-400",
      variant === "danger" && "bg-red-900/30 text-red-400",
      variant === "info" && "bg-cyan-900/30 text-cyan-400",
      variant === "accent" && "bg-accent-subtle text-accent",
      className
    )}>
      {children}
    </span>
  );
}
