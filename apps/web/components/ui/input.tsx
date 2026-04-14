import type { InputHTMLAttributes } from "react";
import { cn } from "../utils";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500",
      className
    )}
    {...props}
  />
);
