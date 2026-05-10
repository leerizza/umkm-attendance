import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { AttendanceNotifier } from "./AttendanceNotifier";
import { InstallPrompt } from "./InstallPrompt";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { WifiOff } from "lucide-react";

export function Layout() {
  const isOnline = useOnlineStatus();

  return (
    <div className="flex min-h-screen bg-background">
      <AttendanceNotifier />
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Offline banner */}
        {!isOnline && (
          <div className="sticky top-0 z-50 bg-amber-500 text-white text-xs font-medium px-4 py-2 flex items-center gap-2 justify-center">
            <WifiOff className="h-3.5 w-3.5" />
            Kamu sedang offline — beberapa fitur tidak tersedia
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 bottom-nav-pad md:pb-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
