// routes/index.tsx - ACTUALIZADO
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/auth/login";
import HomeScreen from "@/pages/dashboard/home";
import BillingPage from "@/pages/billing";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SmartLabelsPage } from "@/pages/smart-labels";
import BinDetailsPage from "@/pages/dashboard/binDetail";
import { LocationsManager } from "@/pages/dashboard/Locations";
import SocialScreen from "@/pages/dashboard/SocialScreen";
import ActiveSubscriptionPage from "@/pages/billing/ActiveSubscriptionPage";
import { TemplatesView } from "@/pages/smart-labels/components/TemplatesView";
import LoginByToken from "@/pages/auth/login-by-token";
import ExportInventory from "@/pages/dashboard/ExportInventory";
import NotFoundPage from "./NotFoundPage";
import TokensPurchasePage from "@/pages/billing/TokensPage";

// Componente para proteger rutas
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, loading } = useAuth();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    const checkSubscription = async () => {
      if (currentUser) {
        const subscriptionsRef = collection(db, "subscriptions");
        const q = query(
          subscriptionsRef,
          where("userId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        setHasSubscription(!querySnapshot.empty);
      }
      setSubscriptionLoading(false);
    };

    checkSubscription();
  }, [currentUser]);

  if (loading || subscriptionLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!hasSubscription) {
    return <Navigate to="/billing" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

const ProtectedRouteLayout = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, loading } = useAuth();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    const checkSubscription = async () => {
      if (currentUser) {
        const subscriptionsRef = collection(db, "subscriptions");
        const q = query(
          subscriptionsRef,
          where("userId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        setHasSubscription(!querySnapshot.empty);
      }
      setSubscriptionLoading(false);
    };

    checkSubscription();
  }, [currentUser]);

  if (loading || subscriptionLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (hasSubscription) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

const ProtectedAuthRouteLayout = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Componente para redirigir usuarios autenticados
const RedirectIfAuthenticated = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (currentUser) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/home" replace />,
  },
  {
    path: "/smart-labels",
    element: (
      <ProtectedRoute>
        <SmartLabelsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/smart-labels/templates",
    element: (
      <ProtectedRoute>
        <TemplatesView />
      </ProtectedRoute>
    ),
  },
  {
    path: "/billing",
    element: (
      <ProtectedRouteLayout>
        {" "}
        <BillingPage />{" "}
      </ProtectedRouteLayout>
    ),
  },
  {
    path: "/login",
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: "/login-by-token",
    element: (
      <RedirectIfAuthenticated>
        <LoginByToken />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: "/home",
    element: (
      <ProtectedRoute>
        <HomeScreen />
      </ProtectedRoute>
    ),
  },
  {
    path: "/locations",
    element: (
      <ProtectedRoute>
        <LocationsManager />
      </ProtectedRoute>
    ),
  },
  {
    path: "/bin-details/:id",
    element: (
      <ProtectedRoute>
        <BinDetailsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/shared",
    element: (
      <ProtectedRoute>
        <SocialScreen />
      </ProtectedRoute>
    ),
  },
  {
    path: "/subscription",
    element: (
      <ProtectedRoute>
        <ActiveSubscriptionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/tokensai",
    element: (
      <ProtectedRoute>
        <TokensPurchasePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/tokens-ai",
    element: (
      <ProtectedAuthRouteLayout>
        <TokensPurchasePage />
      </ProtectedAuthRouteLayout>
    ),
  },
  {
    path: "/export-inventory",
    element: (
      <ProtectedRoute>
        <ExportInventory />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
