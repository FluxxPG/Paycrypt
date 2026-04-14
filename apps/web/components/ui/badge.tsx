import type { HTMLAttributes } from "react";
import { cn } from "../utils";

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200",
      className
    )}
    {...props}
  />
);
