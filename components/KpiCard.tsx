import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
  tone?: "neutral" | "positive" | "negative";
}

const toneClass: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
};

export function KpiCard({
  title,
  value,
  subtitle,
  tooltip,
  tone = "neutral",
}: KpiCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs text-muted">
          <span>{title}</span>
          {tooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
                    aria-label={`Info ${title}`}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 text-xs leading-relaxed">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn("font-mono text-2xl font-semibold", toneClass[tone])}>{value}</div>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
