import { Icon } from "@iconify/react"
import { cn } from "@/utils/styles/utils"

function Spinner({ className }: { className?: string }) {
  return (
    <Icon
      icon="tabler:loader"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
    />
  )
}

export { Spinner }
