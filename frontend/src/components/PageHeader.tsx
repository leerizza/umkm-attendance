import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border",
      className
    )}>
      <div className="flex items-center justify-between px-4 md:px-6 h-14 md:h-16">
        <div>
          <h1 className="text-base md:text-lg font-bold text-foreground leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
