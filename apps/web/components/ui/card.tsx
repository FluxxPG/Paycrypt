import type { HTMLAttributes } from "react";
import { cn } from "../utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("glass rounded-3xl p-6", className)} {...props} />
);
