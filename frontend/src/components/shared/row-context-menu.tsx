import { Fragment, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icon-map";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export interface RowContextMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  variant?: "default" | "destructive";
  separatorBefore?: boolean;
  disabled?: boolean;
}

interface RowContextMenuProps {
  children: ReactNode;
  items: RowContextMenuItem[];
}

export function RowContextMenu({ children, items }: RowContextMenuProps) {
  if (items.length === 0) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorBefore && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={item.onSelect}
              variant={item.variant}
              disabled={item.disabled}
            >
              <Icon name={item.icon} className="size-3.5" />
              {item.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
