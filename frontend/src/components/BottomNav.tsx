import { NavLink, useLocation } from "react-router-dom";
import { Home, Clock, CalendarOff, Timer, User, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

const BASE_NAV = [
  { to: "/",           label: "Home",    Icon: Home },
  { to: "/attendance", label: "Absensi", Icon: Clock },
  { to: "/leave",      label: "Cuti",    Icon: CalendarOff },
  { to: "/overtime",   label: "Lembur",  Icon: Timer },
  { to: "/profile",    label: "Profil",  Icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const { profile } = useAuthStore();

  const isAdmin = profile?.role === "admin";

  const NAV_ITEMS = [
    ...BASE_NAV,
    ...(isAdmin ? [{ to: "/admin", label: "Admin", Icon: LayoutDashboard }] : []),
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border safe-bottom md:hidden">
      <div className="flex items-stretch h-[60px]">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 tap-target transition-colors duration-150",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "relative flex items-center justify-center w-10 h-6 rounded-full transition-all duration-200",
                isActive && "bg-primary/10"
              )}>
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={cn(
                "text-[10px] font-medium leading-none",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
