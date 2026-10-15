import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  Search,
  Share2,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function SocialScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { currentUser } = useAuth();

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

  const [sharedAccounts, setSharedAccounts] = useState<any[]>([]);
  const [sharedByMeAccounts, setSharedByMeAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

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
        message: t("social.errors.emptyUsername"),
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
          message: t("social.errors.userNotFound"),
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
          message: t("social.alreadyShared.message"),
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
        message: t("social.success.message"),
      });
      await fetchSharedData();
    } catch (error) {
      console.error("Error granting access:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: t("social.errors.grantFailed"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const viewSharedInventory = (sharedAccount: any) => {
    // Guardar en localStorage en lugar de usar setImpersonatedUser
    localStorage.setItem("impersonatedUser", JSON.stringify(sharedAccount));
    console.log("Usuario a impersonar:", sharedAccount);
    navigate(`/home`);
  };

  const handleRevokeAccess = async (accountId: any, accountName: any) => {
    const confirmRevoke = window.confirm(
      t("shareAccess.revokeMessage", { name: accountName })
    );

    if (confirmRevoke) {
      try {
        await supabase.from("shared_access").delete().eq("id", accountId);
        await fetchSharedData();
      } catch (error) {
        console.error("Error revoking access:", error);
        setModalState({
          isOpen: true,
          type: "error",
          message: t("social.errors.revokeFailed"),
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header with gradient and glass effect */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-white/20 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  {t("shareAccess.title")}
                </h1>
                <p className="text-gray-600 mt-1">
                  {t("shareAccess.subtitle")}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setIsModalVisible(true)}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              size="lg"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t("shareAccess.addNew")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Shared with Me Section */}
        <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {t("shareAccess.sharedWithMe")}
              </span>
              <Badge
                variant="secondary"
                className="ml-auto bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
              >
                {sharedAccounts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sharedAccounts.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {sharedAccounts.map((account: any) => (
                  <div
                    key={account.id}
                    onClick={() => viewSharedInventory(account)}
                    className="group flex items-center p-6 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 cursor-pointer transition-all duration-300 border-l-4 border-transparent hover:border-l-blue-500"
                  >
                    <Avatar className="w-12 h-12 mr-4 ring-2 ring-blue-100 group-hover:ring-blue-300 transition-all duration-300">
                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold">
                        {account.ownerDisplayName?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-900 transition-colors">
                        {account.ownerDisplayName}
                      </h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />@{account.ownerUsername}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {t("shareAccess.active")}
                      </Badge>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserCheck className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-lg">
                  {t("shareAccess.noAccountsSharedWithYou")}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  {t("shareAccess.subtitle2")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shared By Me Section */}
        <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {t("shareAccess.sharedByMe")}
              </span>
              <Badge
                variant="secondary"
                className="ml-auto bg-purple-100 text-purple-800 hover:bg-purple-200"
              >
                {sharedByMeAccounts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sharedByMeAccounts.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {sharedByMeAccounts.map((account: any) => (
                  <div
                    key={account.id}
                    className="group flex items-center p-6 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all duration-300 border-l-4 border-transparent hover:border-l-purple-500"
                  >
                    <Avatar className="w-12 h-12 mr-4 ring-2 ring-purple-100 group-hover:ring-purple-300 transition-all duration-300">
                      <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold">
                        {account.grantedDisplayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 group-hover:text-purple-900 transition-colors">
                        {account.grantedDisplayName}
                      </h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />@{account.grantedUsername}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200"
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {t("shareAccess.shared")}
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
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-all duration-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-lg">
                  {t("shareAccess.noAccountsSharedByYou")}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  {t("shareAccess.shared2")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Modal */}
      {isModalVisible && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300 scale-100 opacity-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg">
                    <Share2 className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {t("shareAccess.title")}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUsername("");
                    setIsModalVisible(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("shareAccess.user")}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("shareAccess.inputPlaceholder")}
                    className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUsername("");
                    setIsModalVisible(false);
                  }}
                  className="flex-1 h-12 border-gray-200 hover:bg-gray-50"
                >
                  {t("shareAccess.cancel")}
                </Button>
                <Button
                  onClick={handleShare}
                  disabled={isProcessing || !username.trim()}
                  className="flex-1 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("shareAccess.pro")}
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 mr-2" />
                      {t("shareAccess.share")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
