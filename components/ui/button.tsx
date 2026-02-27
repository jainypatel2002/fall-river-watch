import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none motion-reduce:transition-none motion-reduce:transform-none",
  {
    variants: {
      variant: {
        default:
          "border border-[rgba(34,211,238,0.4)] bg-gradient-to-b from-[rgba(28,47,87,0.96)] via-[rgba(14,25,47,0.98)] to-[rgba(8,13,25,1)] text-[var(--fg)] shadow-[var(--shadow-3d)] before:pointer-events-none before:absolute before:inset-x-2 before:top-px before:h-px before:rounded-full before:bg-white/50 hover:-translate-y-[2px] hover:shadow-[0_10px_0_rgba(5,8,14,0.95),0_18px_30px_rgba(2,9,22,0.48),var(--glow)]",
        destructive:
          "border border-[rgba(251,113,133,0.5)] bg-gradient-to-b from-[rgba(127,29,29,0.95)] to-[rgba(69,10,10,0.98)] text-rose-50 shadow-[0_8px_0_rgba(24,9,13,0.95),0_14px_26px_rgba(52,8,17,0.4)] before:pointer-events-none before:absolute before:inset-x-2 before:top-px before:h-px before:rounded-full before:bg-white/45 hover:-translate-y-[1px] hover:shadow-[0_9px_0_rgba(24,9,13,0.95),0_16px_32px_rgba(136,19,55,0.35)]",
        outline:
          "border border-[var(--border)] bg-[rgba(8,12,20,0.75)] text-[var(--fg)] shadow-[0_6px_0_rgba(5,8,14,0.9)] before:pointer-events-none before:absolute before:inset-x-2 before:top-px before:h-px before:rounded-full before:bg-white/30 hover:-translate-y-[1px] hover:border-[rgba(34,211,238,0.5)] hover:shadow-[0_8px_0_rgba(5,8,14,0.9),0_0_16px_rgba(34,211,238,0.24)]",
        secondary:
          "border border-[rgba(217,70,239,0.45)] bg-[rgba(18,19,39,0.78)] text-[var(--fg)] shadow-[0_7px_0_rgba(5,8,14,0.9)] before:pointer-events-none before:absolute before:inset-x-2 before:top-px before:h-px before:rounded-full before:bg-white/36 hover:-translate-y-[1px] hover:shadow-[0_9px_0_rgba(5,8,14,0.9),0_0_18px_rgba(217,70,239,0.3)]",
        ghost: "border border-transparent bg-transparent text-[color:var(--muted)] shadow-none hover:border-[var(--border)] hover:bg-[rgba(15,22,38,0.72)] hover:text-[var(--fg)]"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-11 px-7",
        icon: "h-10 w-10 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => {
  return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
