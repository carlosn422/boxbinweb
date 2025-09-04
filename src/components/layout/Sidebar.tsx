// components/layout/Sidebar.tsx
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  LogOut,
  MapPin,
  User,
  ChevronLeft,
  ChevronRight,
  PersonStandingIcon,
  Settings,
  Download,
  Bot,
} from "lucide-react";
import { useState, useEffect } from "react";
import { logoutUser } from "@/lib/firebase";
import LogoIcon from "@/assets/logo.png";
import { LanguageSelector } from "./LanguageSelector";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  // Collapse by default on smaller screens (<768px)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    setCollapsed(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const sidebarItems = [
    { title: t("sidebar.dashboard"), href: "/home", icon: Home, badge: null },
    { title: t("sidebar.locations"), href: "/locations", icon: MapPin, badge: null },
    { title: t("sidebar.sharedAccess"), href: "/shared", icon: PersonStandingIcon, badge: t("sidebar.new") },
    { title: t("sidebar.subscription"), href: "/subscription", icon: Settings, badge: null },
    { title: t("sidebar.tokensAI"), href: "/tokensai", icon: Bot, badge: null },
    { title: t("sidebar.exportInventory"), href: "/export-inventory", icon: Download, badge: null },
    {
      title: t("sidebar.smartLabels"),
      href: "/smart-labels",
      icon: () => (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
      badge: null,
    },
  ];

  const handleLogout = async () => {
    try {
      await logoutUser();
      localStorage.removeItem("impersonatedUser");
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
        {!collapsed && (
          <div className="flex items-center space-x-3">
            <img 
              src={LogoIcon} 
              alt="Logo" 
              className="w-8 h-8 rounded-md object-cover" 
            />
            <div>
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                {t("sidebar.dashboard")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">v2.0</p>
            </div>
          </div>
        )}
        {collapsed && (
          <img 
            src={LogoIcon} 
            alt="Logo" 
            className="w-8 h-8 rounded-md object-cover mx-auto" 
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <div key={item.href} className="relative group">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full h-10 rounded-md font-medium text-sm transition-colors duration-200",
                    collapsed ? "px-2 justify-center" : "px-3 justify-start",
                    isActive
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                  onClick={() => navigate(item.href)}
                >
                  <Icon className={cn("h-4 w-4 flex-shrink-0", !collapsed && "mr-3")} />
                  {!collapsed && (
                    <div className="flex items-center justify-between w-full min-w-0">
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <Badge 
                          variant="secondary" 
                          className="ml-2 h-5 text-xs font-medium bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                  )}
                </Button>
                {collapsed && (
                  <div className="absolute left-full top-0 ml-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
                    {item.title}
                    {item.badge && (
                      <span className="ml-2 px-1.5 py-0.5 bg-blue-600 dark:bg-blue-500 text-white text-xs rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        
        <Separator className="mx-3 my-4 bg-slate-200 dark:bg-slate-800" />
        
        <div className="px-3">
          <LanguageSelector collapsed={collapsed} />
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4">
        {currentUser && (
          <div className={cn(
            "flex items-center mb-3",
            collapsed ? "justify-center" : "space-x-3 p-3 rounded-md bg-slate-50 dark:bg-slate-900"
          )}>
            <div className="relative group">
              <div className="w-8 h-8 bg-slate-900 dark:bg-slate-100 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white dark:text-slate-900" />
              </div>
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
                  <div className="font-medium">{currentUser.displayName || t("sidebar.user")}</div>
                  <div className="text-xs opacity-75">{currentUser.email}</div>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {currentUser.displayName || t("sidebar.user")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {currentUser.email}
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="relative group">
          <Button
            variant="ghost"
            className={cn(
              "w-full h-10 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors duration-200",
              collapsed ? "px-2 justify-center" : "px-3 justify-start"
            )}
            onClick={handleLogout}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-3")} />
            {!collapsed && <span>{t("sidebar.logout")}</span>}
          </Button>
          {collapsed && (
            <div className="absolute left-full top-0 ml-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
              {t("sidebar.logout")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}