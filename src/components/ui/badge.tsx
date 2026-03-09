import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.01em] transition-[background-color,border-color,color] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-input bg-surface-glass text-foreground",
        success: "border-transparent bg-[#d9eee7] text-[#165443] dark:bg-[#1a3a2c] dark:text-[#82c4a5]",
        warning: "border-transparent bg-[#f3e6cc] text-[#8a5f17] dark:bg-[#3a2e18] dark:text-[#d4b882]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
