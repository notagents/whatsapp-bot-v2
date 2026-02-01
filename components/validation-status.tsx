"use client";

import { cn } from "@/lib/utils";

type Props = {
  valid: boolean;
  message?: string;
  timestamp?: number;
  className?: string;
};

export function ValidationStatus({
  valid,
  message,
  timestamp,
  className,
}: Props) {
  if (valid) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-green-600 dark:text-green-400",
          className
        )}
      >
        <span className="size-2 rounded-full bg-green-500" />
        <span>Valid</span>
        {timestamp != null && timestamp > 0 && (
          <span className="text-muted-foreground text-xs">
            {new Date(timestamp).toLocaleString()}
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-1 text-sm text-red-600 dark:text-red-400",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-red-500" />
        <span>Invalid</span>
      </div>
      {message && (
        <pre className="overflow-x-auto rounded border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-800 dark:bg-red-950">
          {message}
        </pre>
      )}
    </div>
  );
}
