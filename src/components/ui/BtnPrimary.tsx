import type { ReactNode, ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

export default function BtnPrimary({ children, className = "", variant = "primary", ...props }: Props) {
  const base = "font-mono text-xs uppercase tracking-wider inline-flex items-center gap-3 cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary: `${base} bg-mint text-bg-base px-6 py-3 hover:bg-accent disabled:hover:bg-mint`,
    secondary: `${base} bg-transparent text-mint border border-mint/30 px-6 py-3 hover:border-mint hover:bg-mint/10 disabled:hover:bg-transparent disabled:hover:border-mint/30`,
    ghost: `${base} bg-transparent text-muted px-4 py-2 hover:text-mint`,
  };

  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
