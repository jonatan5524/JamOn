import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Event from "./pages/Event";
import JoinByCode from "./pages/JoinByCode";
import UserMenu from "@/components/layout/UserMenu";
import { useSpotifyAuth } from "./hooks/use-spotify-auth";

const queryClient = new QueryClient();

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useSpotifyAuth();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {children}
      <UserMenu />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId"
            element={
              <ProtectedRoute>
                <Event />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join/:code"
            element={
              <ProtectedRoute>
                <JoinByCode />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
