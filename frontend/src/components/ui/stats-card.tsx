import * as React from "react"
import { cn } from "@/lib/utils"

interface StatsCardProps extends React.ComponentProps<"div"> {
  label: string
  value: string | number
  trend?: { value: number; direction: "up" | "down" }
  icon?: React.ReactNode
  description?: string
}

function StatsCard({
  label,
  value,
  trend,
  icon,
  description,
  className,
  ...props
}: StatsCardProps) {
  return (
    <div
      data-slot="stats-card"
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-5 text-card-foreground shadow-sm",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className="text-muted-foreground/60">{icon}</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              trend.direction === "up"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {trend.direction === "up" ? "↑" : "↓"}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      {description && (
        <span className="text-xs text-muted-foreground">{description}</span>
      )}
    </div>
  )
}

export { StatsCard }
export type { StatsCardProps }
