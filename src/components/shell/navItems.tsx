import {
  Bell,
  Bookmark,
  Bot,
  Compass,
  House,
  MessageCircleMore,
  Settings,
  Shield,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import type { Me } from "@/lib/types";

export function navItems(me: Me) {
  return [
    { href: "/", label: "Home", icon: House },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/chat", label: "Chat", icon: MessageCircleMore, badge: me.unread_messages },
    { href: "/notifications", label: "Notifications", icon: Bell, badge: me.unread_notifications },
    { href: "/menace", label: "AI Menace", icon: Bot },
    { href: "/chaos", label: "Chaos Tools", icon: Zap },
    { href: "/leaderboard", label: "Leaderboards", icon: Trophy },
    { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    { href: `/u/${me.username}`, label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
    ...(me.role === "owner" || me.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];
}
