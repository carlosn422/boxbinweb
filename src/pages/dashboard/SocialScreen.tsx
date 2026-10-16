import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import {
  Share2,
  Users,
  UserCheck,
  Trash2,
  ChevronRight,
  Shield,
  Search,
  Mail,
  Loader2,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";

export default function SocialScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<"withMe" | "byMe">("withMe");
  const [sharedAccounts, setSharedAccounts] = useState<any[]>([]);
  const [sharedByMeAccounts, setSharedByMeAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: ModalType;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    type: "info",
    message: "",
  });

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const fetchSharedData = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);

      // Shared with me
      const { data: sharedWithMe } = await supabase
        .from("shared_access")
        .select("*")
        .eq("grantedUserId", currentUser.uid);

      if (sharedWithMe && sharedWithMe.length > 0) {
        const ownerIds = sharedWithMe.map((s) => s.ownerUserId).filter(Boolean);
        const { data: ownerUsers } = await supabase
          .from("users")
          .select("uid, username, displayName")
          .in("uid", ownerIds);

        const ownerMap = new Map((ownerUsers || []).map((u) => [u.uid, u]));

        const withMeData = sharedWithMe.map((item) => {
          const owner = ownerMap.get(item.ownerUserId);
          return {
            id: item.id,
            ...item,
            ownerUsername: owner?.username || "Unknown",
            ownerDisplayName: owner?.displayName || owner?.username || "Unknown",
          };
        });
        setSharedAccounts(withMeData);
      } else {
        setSharedAccounts([]);
      }

      // Shared by me
      const { data: sharedByMe } = await supabase
        .from("shared_access")
        .select("*")
        .eq("ownerUserId", currentUser.uid);

      if (sharedByMe && sharedByMe.length > 0) {
        const grantedIds = sharedByMe.map((s) => s.grantedUserId).filter(Boolean);
        const { data: grantedUsers } = await supabase
          .from("users")
          .select("uid, username, displayName")
          .in("uid", grantedIds);

        const grantedMap = new Map((grantedUsers || []).map((u) => [u.uid, u]));

        const byMeData = sharedByMe.map((item) => {
          const granted = grantedMap.get(item.grantedUserId);
          return {
            id: item.id,
            ...item,
            grantedUsername: granted?.username || "Unknown",
            grantedDisplayName: granted?.displayName || granted?.username || "Unknown",
          };
        });
        setSharedByMeAccounts(byMeData);
      } else {
        setSharedByMeAccounts([]);
      }
    } catch (err) {
      console.error("Error fetching shared access:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSharedData();
  }, [currentUser]);

  const handleShare = async () => {
    if (!username.trim()) {
      setModalState({
        isOpen: true,
        type: "error",
        message: t("social.errors.emptyUsername") || "Please enter a valid username",
      });
      return;
    }

    setIsProcessing(true);
    try {
      if (!currentUser) return;

      const { data: targetUser, error: userErr } = await supabase
        .from("users")
        .select("*")
        .eq("username", username.trim())
        .maybeSingle();

      if (userErr || !targetUser) {
        setModalState({
          isOpen: true,
          type: "error",
          message: t("social.errors.userNotFound") || "User not found",
        });
        setIsProcessing(false);
        setUsername("");
        setIsModalVisible(false);
        return;
      }

      const { data: existingAccess } = await supabase
        .from("shared_access")
        .select("id")
        .eq("ownerUserId", currentUser.uid)
        .eq("grantedUserId", targetUser.uid)
        .maybeSingle();

      if (existingAccess) {
        setModalState({
          isOpen: true,
          type: "error",
          message: t("social.alreadyShared.message") || "Access is already shared with this user",
        });
        setIsProcessing(false);
        return;
      }

      await supabase.from("shared_access").insert({
        ownerUserId: currentUser.uid,
        grantedUserId: targetUser.uid,
        createdAt: new Date().toISOString(),
      });

      setUsername("");
      setIsModalVisible(false);
      setModalState({
        isOpen: true,
        type: "success",
        message: t("social.success.message") || "Access shared successfully",
      });
      await fetchSharedData();
    } catch (error) {
      console.error("Error granting access:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: t("social.errors.grantFailed") || "Failed to grant access",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const viewSharedInventory = (sharedAccount: any) => {
    localStorage.setItem("impersonatedUser", JSON.stringify(sharedAccount));
    navigate(`/home`);
  };

  const handleRevokeAccess = async (accountId: any, accountName: any) => {
    const confirmRevoke = window.confirm(
      t("shareAccess.revokeMessage", { name: accountName }) ||
      `Are you sure you want to revoke access for ${accountName}?`
    );

    if (confirmRevoke) {
      try {
        await supabase.from("shared_access").delete().eq("id", accountId);
        await fetchSharedData();
        setModalState({
          isOpen: true,
          type: "success",
          message: "Access revoked successfully",
        });
      } catch (error) {
        console.error("Error revoking access:", error);
        setModalState({
          isOpen: true,
          type: "error",
          message: t("social.errors.revokeFailed") || "Failed to revoke access",
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-5xl space-y-4">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("shareAccess.title") || "Shared Access"}
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
                Team
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("shareAccess.subtitle") ||
                "Collaborate with your team by sharing access to inventories and containers"}
            </p>
          </div>

          <Button
            onClick={() => setIsModalVisible(true)}
            className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t("shareAccess.addNew") || "Grant Access"}</span>
          </Button>
        </div>

        {/* Space-Optimized KPI Stat Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Shared with Me Card */}
          <div
            onClick={() => setActiveTab("withMe")}
            className={`rounded-xl border p-3 flex items-center justify-between shadow-2xs cursor-pointer transition-all ${activeTab === "withMe"
                ? "bg-white border-blue-500 ring-2 ring-blue-500/15"
                : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <UserCheck className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("shareAccess.sharedWithMe") || "Shared With Me"}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {sharedAccounts.length}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">Accessible</span>
          </div>

          {/* Shared By Me Card */}
          <div
            onClick={() => setActiveTab("byMe")}
            className={`rounded-xl border p-3 flex items-center justify-between shadow-2xs cursor-pointer transition-all ${activeTab === "byMe"
                ? "bg-white border-blue-500 ring-2 ring-blue-500/15"
                : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Users className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("shareAccess.sharedByMe") || "Shared By Me"}
                </p>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {sharedByMeAccounts.length}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">Delegated</span>
          </div>
        </div>

        {/* Segmented Tab Selector */}
        <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200/70 grid grid-cols-2 max-w-xs">
          <button
            onClick={() => setActiveTab("withMe")}
            className={`h-7 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "withMe"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
              }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Shared with Me ({sharedAccounts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("byMe")}
            className={`h-7 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "byMe"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Shared by Me ({sharedByMeAccounts.length})</span>
          </button>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 bg-white rounded-xl border border-slate-200/80 p-4 animate-pulse flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-full"></div>
                  <div className="space-y-1">
                    <div className="w-24 h-3.5 bg-slate-100 rounded"></div>
                    <div className="w-16 h-2.5 bg-slate-100 rounded"></div>
                  </div>
                </div>
                <div className="w-16 h-6 bg-slate-100 rounded"></div>
              </div>
            ))}
          </div>
        ) : activeTab === "withMe" ? (
          sharedAccounts.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
              {sharedAccounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => viewSharedInventory(account)}
                  className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Avatar className="w-9 h-9 shrink-0 border border-slate-200">
                      <AvatarFallback className="bg-slate-900 text-white font-bold text-xs">
                        {account.ownerDisplayName?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 text-xs group-hover:text-blue-600 transition-colors truncate">
                        {account.ownerDisplayName}
                      </h3>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        <span>@{account.ownerUsername}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200/70 text-[10px] font-semibold h-5 px-2"
                    >
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      <span>{t("shareAccess.active") || "Active Access"}</span>
                    </Badge>
                    <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center">
                      <span>View Inventory</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">
                {t("shareAccess.noAccountsSharedWithYou") || "No shared accounts available"}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {t("shareAccess.subtitle2") ||
                  "When other users share their inventory with you, they will appear here."}
              </p>
            </div>
          )
        ) : sharedByMeAccounts.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {sharedByMeAccounts.map((account) => (
              <div
                key={account.id}
                className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Avatar className="w-9 h-9 shrink-0 border border-slate-200">
                    <AvatarFallback className="bg-indigo-600 text-white font-bold text-xs">
                      {account.grantedDisplayName?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 text-xs truncate">
                      {account.grantedDisplayName}
                    </h3>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" />
                      <span>@{account.grantedUsername}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="secondary"
                    className="bg-blue-50 text-blue-700 border-blue-200/70 text-[10px] font-semibold h-5 px-2"
                  >
                    <Shield className="w-2.5 h-2.5 mr-1" />
                    <span>{t("shareAccess.shared") || "Shared"}</span>
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleRevokeAccess(
                        account.id,
                        account.grantedDisplayName
                      )
                    }
                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    <span>Revoke</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {t("shareAccess.noAccountsSharedByYou") || "No shared access granted"}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {t("shareAccess.shared2") ||
                "Grant access to colleagues or warehouse managers so they can view your inventory."}
            </p>
            <Button
              size="sm"
              onClick={() => setIsModalVisible(true)}
              className="h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              <span>Grant Access to a User</span>
            </Button>
          </div>
        )}
      </div>

      {/* Grant Access Dialog */}
      <Dialog open={isModalVisible} onOpenChange={setIsModalVisible}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-600" />
              <span>{t("shareAccess.title") || "Grant Shared Access"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                {t("shareAccess.user") || "Username to share with"}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("shareAccess.inputPlaceholder") || "Enter exact username (e.g. john_doe)"}
                  className="h-8.5 pl-8 text-xs bg-slate-50 border-slate-200"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                The user must have an active BoxBin account.
              </p>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUsername("");
                  setIsModalVisible(false);
                }}
                className="flex-1 h-8 text-xs border-slate-200"
              >
                {t("shareAccess.cancel") || "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={handleShare}
                disabled={isProcessing || !username.trim()}
                className="flex-1 h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-2xs"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{t("shareAccess.share") || "Grant Access"}</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ModalMessage
        isOpen={modalState.isOpen}
        onClose={closeModal}
        type={modalState.type}
        message={modalState.message}
        title={modalState.title}
      />
    </div>
  );
}
