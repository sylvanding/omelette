import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressBarProps extends React.ComponentProps<"div"> {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: "sm" | "md" | "lg"
}

function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  className,
  ...props
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div
      data-slot="progress-bar"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {label && (
            <span className="font-medium text-foreground">{label}</span>
          )}
          {showValue && (
            <span className="text-muted-foreground tabular-nums">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          "w-full overflow-hidden rounded-full bg-secondary",
          size === "sm" && "h-1.5",
          size === "md" && "h-2.5",
          size === "lg" && "h-4"
        )}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
export type { ProgressBarProps }
