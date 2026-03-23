import type { ReactNode, ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export default function BtnPrimary({ children, className = "", ...props }: Props) {
  return (
    <button
      className={`
        bg-forest-mid text-off-white border-none px-6 py-3
        font-mono text-[11px] uppercase tracking-wider
        inline-flex items-center gap-3 cursor-pointer
        transition-all duration-200
        hover:bg-accent hover:text-bg-base
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-forest-mid disabled:hover:text-off-white
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
