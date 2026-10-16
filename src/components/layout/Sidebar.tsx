// components/layout/Sidebar.tsx
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { logoutUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import LogoIcon from "@/assets/logo.png";
import { LanguageSelector } from "./LanguageSelector";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  QrCode,
  MapPin,
  Users,
  CreditCard,
  Sparkles,
  Download,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  // Desktop collapsed state
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer open state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Auto-collapse sidebar on smaller screens, close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const sidebarItems = [
    {
      title: t("sidebar.dashboard", { defaultValue: "Dashboard" }),
      href: "/home",
      icon: Home,
      badge: null,
    },
    {
      title: t("sidebar.smartLabels", { defaultValue: "Smart Labels" }),
      href: "/smart-labels",
      icon: QrCode,
      badge: null,
    },
    {
      title: t("sidebar.locations", { defaultValue: "Locations" }),
      href: "/locations",
      icon: MapPin,
      badge: null,
    },
    {
      title: t("sidebar.sharedAccess", { defaultValue: "Shared Access" }),
      href: "/shared",
      icon: Users,
      badge: t("sidebar.new", { defaultValue: "New" }),
    },
    {
      title: t("sidebar.subscription", { defaultValue: "Subscription" }),
      href: "/subscription",
      icon: CreditCard,
      badge: null,
    },
    {
      title: t("sidebar.tokensAI", { defaultValue: "AI Tokens" }),
      href: "/tokensai",
      icon: Sparkles,
      badge: null,
    },
    {
      title: t("sidebar.exportInventory", { defaultValue: "Export Inventory" }),
      href: "/export-inventory",
      icon: Download,
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

  const isItemActive = (href: string) => {
    if (href === "/home") {
      return location.pathname === "/home";
    }
    return location.pathname.startsWith(href);
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name && name.trim()) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "U";
  };

  return (
    <>
      {/* =====================================================================
          1. MOBILE TOP BAR (< 768px)
          Provides a clean header without consuming horizontal space
         ===================================================================== */}
      <header className="md:hidden h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 flex items-center justify-between shrink-0 z-30 font-sans shadow-2xs">
        <div
          className="flex items-center space-x-2.5 cursor-pointer"
          onClick={() => navigate("/home")}
        >
          <img
            src={LogoIcon}
            alt="BoxBin"
            className="w-7 h-7 rounded-lg object-contain shrink-0"
          />
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-900 tracking-tight text-sm">
              BoxBin
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
              App
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mobile User Avatar Mini */}
          {currentUser && (
            <div
              onClick={() => setIsMobileOpen(true)}
              className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold cursor-pointer ring-2 ring-slate-100 overflow-hidden"
              title={currentUser.displayName || currentUser.email || "User"}
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{getInitials(currentUser.displayName, currentUser.email)}</span>
              )}
            </div>
          )}

          {/* Hamburger Menu Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMobileOpen(true)}
            className="h-8 w-8 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-lg shadow-2xs"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* =====================================================================
          2. MOBILE SLIDE-OVER DRAWER (< 768px)
          Smooth backdrop & full-featured mobile menu
         ===================================================================== */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-[280px] max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-slate-200">
            {/* Drawer Header */}
            <div className="h-14 px-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <img
                  src={LogoIcon}
                  alt="BoxBin"
                  className="w-7 h-7 rounded-lg object-contain"
                />
                <div>
                  <h2 className="font-bold text-slate-900 text-sm tracking-tight leading-tight">
                    BoxBin
                  </h2>
                  <p className="text-[10px] text-slate-400 font-medium">Inventory Suite</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileOpen(false)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Drawer Navigation List */}
            <ScrollArea className="flex-1 py-3 px-3">
              <nav className="space-y-1">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.href);
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        navigate(item.href);
                        setIsMobileOpen(false);
                      }}
                      className={cn(
                        "w-full h-10 px-3 rounded-xl font-medium text-xs flex items-center justify-between transition-colors",
                        active
                          ? "bg-slate-900 text-white font-semibold shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                      )}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-slate-500")} />
                        <span className="truncate">{item.title}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider",
                            active
                              ? "bg-white/20 text-white"
                              : "bg-blue-50 text-blue-700 border border-blue-200/60"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <Separator className="my-3 bg-slate-100" />

              <div className="px-1">
                <LanguageSelector collapsed={false} />
              </div>
            </ScrollArea>

            {/* Drawer User & Logout Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/60">
              {currentUser && (
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex items-center space-x-2.5 mb-2 shadow-2xs">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{getInitials(currentUser.displayName, currentUser.email)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
                      {currentUser.displayName || t("sidebar.user", { defaultValue: "User" })}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full h-9 rounded-xl text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 flex items-center justify-center space-x-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t("sidebar.logout", { defaultValue: "Log out" })}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. DESKTOP SIDEBAR (>= 768px)
          Collapsible, clean Stripe/Linear style
         ===================================================================== */}
      <aside
        className={cn(
          "hidden md:flex relative h-full flex-col bg-white border-r border-slate-200/80 transition-all duration-300 font-sans z-20 shrink-0",
          collapsed ? "w-[68px]" : "w-64",
          className
        )}
      >
        {/* Desktop Header */}
        <div className="h-14 flex items-center justify-between px-3.5 border-b border-slate-100 shrink-0">
          {!collapsed ? (
            <div
              className="flex items-center space-x-2.5 cursor-pointer min-w-0"
              onClick={() => navigate("/home")}
            >
              <img
                src={LogoIcon}
                alt="BoxBin Logo"
                className="w-7 h-7 rounded-lg object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight truncate">
                    BoxBin
                  </h1>
                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                    SaaS
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate">Inventory Suite</p>
              </div>
            </div>
          ) : (
            <img
              src={LogoIcon}
              alt="BoxBin"
              className="w-7 h-7 rounded-lg object-contain mx-auto cursor-pointer"
              onClick={() => navigate("/home")}
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>

        {/* Desktop Navigation */}
        <ScrollArea className="flex-1 py-3 px-2.5">
          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item.href);

              return (
                <div key={item.href} className="relative group">
                  <Button
                    variant="ghost"
                    onClick={() => navigate(item.href)}
                    className={cn(
                      "w-full h-9 rounded-xl font-medium text-xs transition-all duration-150 flex items-center",
                      collapsed ? "px-0 justify-center" : "px-2.5 justify-start",
                      active
                        ? "bg-slate-900 text-white font-semibold shadow-2xs hover:bg-slate-800 hover:text-white"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active ? "text-white" : "text-slate-400 group-hover:text-slate-700",
                        !collapsed && "mr-2.5"
                      )}
                    />

                    {!collapsed && (
                      <div className="flex items-center justify-between w-full min-w-0">
                        <span className="truncate">{item.title}</span>
                        {item.badge && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "ml-1.5 h-4 text-[9px] px-1.5 font-bold uppercase tracking-wider rounded border",
                              active
                                ? "bg-white/20 text-white border-white/20"
                                : "bg-blue-50 text-blue-700 border-blue-200/60"
                            )}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                    )}
                  </Button>

                  {/* Tooltip on Collapsed Mode */}
                  {collapsed && (
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 flex items-center gap-1.5">
                      <span>{item.title}</span>
                      {item.badge && (
                        <span className="px-1 py-0.2 bg-blue-500 text-white text-[9px] font-bold rounded">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <Separator className="my-2.5 bg-slate-100" />

          <div className="px-0.5">
            <LanguageSelector collapsed={collapsed} />
          </div>
        </ScrollArea>

        {/* Desktop Footer (User Profile & Logout) */}
        <div className="border-t border-slate-100 p-2.5 bg-slate-50/50 shrink-0">
          {currentUser && (
            <div
              className={cn(
                "flex items-center mb-1.5 transition-all",
                collapsed
                  ? "justify-center p-1"
                  : "space-x-2.5 p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs"
              )}
            >
              <div className="relative group">
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ring-1 ring-slate-200">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{getInitials(currentUser.displayName, currentUser.email)}</span>
                  )}
                </div>

                {/* User Tooltip for Collapsed Mode */}
                {collapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                    <p className="font-semibold">{currentUser.displayName || "User"}</p>
                    <p className="text-[10px] text-slate-300">{currentUser.email}</p>
                  </div>
                )}
              </div>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
                    {currentUser.displayName || t("sidebar.user", { defaultValue: "User" })}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {currentUser.email}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="relative group">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                "w-full h-8 rounded-xl text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50/80 transition-colors",
                collapsed ? "px-0 justify-center" : "px-2.5 justify-start space-x-2"
              )}
              title={collapsed ? t("sidebar.logout", { defaultValue: "Log out" }) : undefined}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>{t("sidebar.logout", { defaultValue: "Log out" })}</span>}
            </Button>

            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                {t("sidebar.logout", { defaultValue: "Log out" })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}