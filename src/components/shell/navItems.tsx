import {
  Bell,
  Bookmark,
  Bot,
  Compass,
  FolderHeart,
  House,
  MessageCircleMore,
  Palette,
  Settings,
  Shield,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import { useT } from "@/components/providers/I18nProvider";
import { useOpenGates } from "@/lib/client/gates";
import { useShell } from "./AppShell";

// Main navigation, in the person's language. Collections and Creators appear
// once the Open Gates migration is on the database.
export function useNavItems() {
  const { me } = useShell();
  const t = useT();
  const { available } = useOpenGates();
  return [
    { href: "/", label: t("nav.home"), icon: House },
    { href: "/explore", label: t("nav.explore"), icon: Compass },
    ...(available ? [{ href: "/creators", label: t("nav.creators"), icon: Palette }] : []),
    { href: "/chat", label: t("nav.chat"), icon: MessageCircleMore, badge: me.unread_messages },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell, badge: me.unread_notifications },
    { href: "/menace", label: t("nav.menace"), icon: Bot },
    { href: "/chaos", label: t("nav.chaos"), icon: Zap },
    { href: "/leaderboard", label: t("nav.leaderboard"), icon: Trophy },
    { href: "/bookmarks", label: t("nav.bookmarks"), icon: Bookmark },
    ...(available ? [{ href: "/collections", label: t("nav.collections"), icon: FolderHeart }] : []),
    { href: `/u/${me.username}`, label: t("nav.profile"), icon: User },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
    ...(me.role === "owner" || me.role === "admin" ? [{ href: "/admin", label: t("nav.admin"), icon: Shield }] : []),
  ];
}
