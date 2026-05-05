import { NavLink } from "react-router-dom";
import {
  Home, Clock, CalendarOff, Timer, User,
  LayoutDashboard, LogOut,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

const EMPLOYEE_NAV = [
  { to: "/",           label: "Dashboard",  Icon: Home },
  { to: "/attendance", label: "Absensi",    Icon: Clock },
  { to: "/leave",      label: "Cuti",       Icon: CalendarOff },
  { to: "/overtime",   label: "Lembur",     Icon: Timer },
  { to: "/profile",    label: "Profil",     Icon: User },
];

const ADMIN_NAV = [
  { to: "/admin",      label: "Admin Panel", Icon: LayoutDashboard },
];

export function Sidebar() {
  const { profile, logout } = useAuthStore();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  const navItems = [
    ...EMPLOYEE_NAV,
    ...(isAdmin ? ADMIN_NAV : []),
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-white border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
        <img src="/donkap-id.png" alt="Donkap ID" className="w-8 h-8 object-contain shrink-0" />
        <div>
          <p className="text-sm font-bold text-foreground leading-none">Donkap</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
            {profile?.companies?.name ?? "UMKM"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-accent transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {getInitials(profile?.full_name ?? "U")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{profile?.full_name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{profile?.role}</p>
          </div>
          <button
            onClick={logout}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
