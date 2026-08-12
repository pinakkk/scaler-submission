"use client";

import { useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";

export interface AccountMenuProps {
  /** Display name shown in the header and used for the initials fallback. */
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

/**
 * Avatar with a green presence dot opening Profile / Settings / Sign out
 * (BLUEPRINT §6.0, OBSERVED §1).
 *
 * All three items are inert in P5 — Settings is P14 and auth is P12.
 */
export function AccountMenu({ name, email, avatarUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      label="Account"
      placement="bottom-end"
      panelClassName="w-[240px]"
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex items-center rounded-full transition-opacity hover:opacity-90"
        >
          <Avatar
            src={avatarUrl}
            name={name}
            size={36}
            presence
            className="pointer-events-none"
          />
        </button>
      }
    >
      <div className="px-3 pt-1 pb-2">
        <p className="truncate text-[14px] font-semibold text-zm-ink-900">{name}</p>
        {email ? (
          <p className="truncate text-[12px] text-zm-ink-400">{email}</p>
        ) : null}
      </div>

      <DropdownMenuSeparator />

      <DropdownMenuItem icon={<User aria-hidden="true" size={16} />}>
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem icon={<Settings aria-hidden="true" size={16} />}>
        Settings
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem destructive icon={<LogOut aria-hidden="true" size={16} />}>
        Sign out
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
