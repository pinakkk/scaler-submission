"use client";

import { useState } from "react";
import { LogIn, LogOut, Settings, User } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { useSession } from "@/lib/session";
import { useSettings } from "@/components/settings";

export interface AccountMenuProps {
  onOpenSettings?: () => void;
}

/**
 * Current account surface. Signed-out users get the real P12 sign-in action;
 * signed-in users see their FastAPI profile and can end both app/Auth.js
 * sessions. Settings is wired by P14.
 */
export function AccountMenu({ onOpenSettings }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const { openSettings } = useSettings();
  const { user, isLoading, signIn, signOut } = useSession();

  if (!isLoading && !user) {
    return (
      <button
        type="button"
        disabled={signingIn}
        onClick={async () => {
          setSigningIn(true);
          try {
            await signIn();
          } finally {
            setSigningIn(false);
          }
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-zm-blue-600 px-4 text-[14px] font-medium text-white transition-colors hover:bg-zm-blue-700 disabled:opacity-60"
      >
        <LogIn aria-hidden="true" size={16} />
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
    );
  }

  const name = user?.name ?? "Account";

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
            src={user?.avatar_url}
            name={name}
            size={36}
            presence={Boolean(user)}
            className="pointer-events-none"
          />
        </button>
      }
    >
      <div className="px-3 pt-1 pb-2">
        <p className="truncate text-[14px] font-semibold text-zm-ink-900">{name}</p>
        {user?.email ? (
          <p className="truncate text-[12px] text-zm-ink-400">{user.email}</p>
        ) : null}
      </div>

      <DropdownMenuSeparator />

      <DropdownMenuItem icon={<User aria-hidden="true" size={16} />}>
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<Settings aria-hidden="true" size={16} />}
        onClick={() => {
          setOpen(false);
          if (onOpenSettings) onOpenSettings();
          else openSettings("light");
        }}
      >
        Settings
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        destructive
        icon={<LogOut aria-hidden="true" size={16} />}
        onClick={() => {
          setOpen(false);
          signOut();
        }}
      >
        Sign out
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
