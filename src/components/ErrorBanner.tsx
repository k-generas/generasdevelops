import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";

/**
 * Shows WHY something failed, WHAT is missing, and WHAT to do next.
 * Pass `onRetry` to add a retry button.
 */
export function ErrorBanner({
  error,
  context,
  onRetry,
  className,
}: {
  error: unknown;
  context?: string;
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;
  const d = describeError(error, context);
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{d.title}</AlertTitle>
      <AlertDescription>
        <p>{d.message}</p>
        <p className="mt-1 font-medium">How to fix: {d.fix}</p>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3 w-3" /> Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Empty state that explains WHY it's empty and WHAT to do.
 */
export function EmptyState({
  title,
  why,
  action,
}: {
  title: string;
  why: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{why}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
