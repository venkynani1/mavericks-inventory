"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const weeklyConfig = {
  units: { label: "Units handed out", color: "var(--chart-1)" },
} satisfies ChartConfig

export function WeeklyChart({ data }: { data: { week: string; units: number }[] }) {
  return (
    <ChartContainer config={weeklyConfig} className="aspect-auto h-60 w-full">
      <BarChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(l) => `Week of ${l}`} />} />
        <Bar dataKey="units" fill="var(--color-units)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  )
}
