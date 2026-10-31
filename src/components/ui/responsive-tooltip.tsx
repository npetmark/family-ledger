import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

interface ResponsiveTooltipContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  clearTimer: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}

const ResponsiveTooltipContext = React.createContext<ResponsiveTooltipContextValue | null>(null);

function useResponsiveTooltip() {
  const context = React.useContext(ResponsiveTooltipContext);
  if (!context) {
    throw new Error("useResponsiveTooltip must be used within a ResponsiveTooltip");
  }
  return context;
}

export interface ResponsiveTooltipProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  content?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}

export function ResponsiveTooltip({
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  content,
  side = "top",
  align = "center",
  sideOffset = 4,
  className,
}: ResponsiveTooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      controlledOnOpenChange?.(next);
    },
    [isControlled, open, controlledOnOpenChange]
  );

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        setOpen(true);
      }, 120);
    }
  }, [clearTimer, setOpen]);

  const handleMouseLeave = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 150);
    }
  }, [clearTimer, setOpen]);

  React.useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const contextValue = React.useMemo(
    () => ({
      open,
      setOpen,
      clearTimer,
      handleMouseEnter,
      handleMouseLeave,
    }),
    [open, setOpen, clearTimer, handleMouseEnter, handleMouseLeave]
  );

  return (
    <ResponsiveTooltipContext.Provider value={contextValue}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
        {content !== undefined ? (
          <>
            <ResponsiveTooltipTrigger asChild>{children}</ResponsiveTooltipTrigger>
            <ResponsiveTooltipContent side={side} align={align} sideOffset={sideOffset} className={className}>
              {content}
            </ResponsiveTooltipContent>
          </>
        ) : (
          children
        )}
      </PopoverPrimitive.Root>
    </ResponsiveTooltipContext.Provider>
  );
}

export const ResponsiveTooltipTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ onClick, onMouseEnter, onMouseLeave, className, ...props }, ref) => {
  const { setOpen, clearTimer, handleMouseEnter, handleMouseLeave } = useResponsiveTooltip();

  return (
    <PopoverPrimitive.Trigger
      ref={ref}
      className={cn("touch-manipulation", className)}
      onMouseEnter={(e) => {
        handleMouseEnter();
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        handleMouseLeave();
        onMouseLeave?.(e);
      }}
      onClick={(e) => {
        clearTimer();
        e.stopPropagation();
        setOpen((prev) => !prev);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
ResponsiveTooltipTrigger.displayName = "ResponsiveTooltipTrigger";

export const ResponsiveTooltipContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", side = "top", sideOffset = 4, onMouseEnter, onMouseLeave, ...props }, ref) => {
  const { handleMouseEnter, handleMouseLeave } = useResponsiveTooltip();

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        side={side}
        sideOffset={sideOffset}
        onMouseEnter={(e) => {
          handleMouseEnter();
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          handleMouseLeave();
          onMouseLeave?.(e);
        }}
        className={cn(
          "z-50 w-auto max-w-[280px] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
ResponsiveTooltipContent.displayName = "ResponsiveTooltipContent";

export const ResponsiveTooltipProvider = ({ children }: { children: React.ReactNode; delayDuration?: number }) => <>{children}</>;
