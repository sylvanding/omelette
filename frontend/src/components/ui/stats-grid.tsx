import * as React from "react"
import { cn } from "@/lib/utils"
import { StatsCard, type StatsCardProps } from "./stats-card"

interface StatsGridProps extends React.ComponentProps<"div"> {
  stats: StatsCardProps[]
  columns?: 2 | 3 | 4 | 5
}

function StatsGrid({
  stats,
  columns = 4,
  className,
  ...props
}: StatsGridProps) {
  return (
    <div
      data-slot="stats-grid"
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        columns === 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
        className
      )}
      {...props}
    >
      {stats.map((stat, i) => (
        <StatsCard key={stat.label || i} {...stat} />
      ))}
    </div>
  )
}

export { StatsGrid }
export type { StatsGridProps }
