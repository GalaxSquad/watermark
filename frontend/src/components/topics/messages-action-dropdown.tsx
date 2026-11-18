import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface MessagesActionDropdownProps {
  onProduce: () => void;
  onDeleteBeforeDate: () => void;
  onPurgeTopic: () => void;
  disabled?: boolean;
}

export function MessagesActionDropdown({ onProduce, onDeleteBeforeDate, onPurgeTopic, disabled }: MessagesActionDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled} className="gap-1.5">
          Actions
          <Icon name="chevron-down" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onProduce}>
          <Icon name="send" className="size-3.5" tone="brand" />
          Produce Message
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDeleteBeforeDate} className="text-red-400 focus:text-red-400">
          <Icon name="calendar-x" className="size-3.5" tone="danger" />
          Delete Before Date…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPurgeTopic} className="text-red-400 focus:text-red-400">
          <Icon name="trash" className="size-3.5" tone="danger" />
          Purge Topic…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
