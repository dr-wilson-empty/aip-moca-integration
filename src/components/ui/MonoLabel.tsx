import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export default function MonoLabel({ children, className = "" }: Props) {
  return (
    <span
      className={`font-mono text-xs uppercase tracking-[0.05em] text-muted block ${className}`}
    >
      {children}
    </span>
  );
}
