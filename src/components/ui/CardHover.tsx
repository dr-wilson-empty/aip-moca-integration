import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export default function CardHover({ children, className = "" }: Props) {
  return (
    <div
      className={`
        border border-forest-deep bg-forest-deep/40 p-6 relative flex flex-col
        transition-all duration-300
        hover:border-accent hover:bg-forest-deep/80
        ${className}
      `}
    >
      {children}
    </div>
  );
}
