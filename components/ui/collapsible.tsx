"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

const Collapsible = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(
  (
    {
      className,
      children,
      defaultOpen,
      open: controlledOpen,
      onOpenChange,
      ...props
    },
    ref
  ) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
      defaultOpen ?? false
    );
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const setOpen = React.useCallback(
      (value: boolean) => {
        if (!isControlled) setUncontrolledOpen(value);
        onOpenChange?.(value);
      },
      [isControlled, onOpenChange]
    );
    return (
      <CollapsibleContext.Provider value={{ open, onOpenChange: setOpen }}>
        <div
          ref={ref}
          className={cn(className)}
          data-state={open ? "open" : "closed"}
          {...props}
        >
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  }
);
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx)
    throw new Error("CollapsibleTrigger must be used within Collapsible");
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={ctx.open}
      className={cn(className)}
      onClick={(e) => {
        ctx.onOpenChange(!ctx.open);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx)
    throw new Error("CollapsibleContent must be used within Collapsible");
  if (!ctx.open) return null;
  return (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  );
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
