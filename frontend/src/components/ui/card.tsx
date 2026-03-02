// frontend/src/components/ui/card.tsx
import { cn } from "../../lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "bg-app-secondary border border-app rounded-lg p-4",
      className
    )}>
      {children}
    </div>
  );
}
