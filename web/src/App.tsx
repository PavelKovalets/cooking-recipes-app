import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAdmin, RequireAuth } from "./components/Guards";

import { CatalogPage } from "./pages/CatalogPage";
import { SearchPage } from "./pages/SearchPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { SmartSelectionPage } from "./pages/SmartSelectionPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AuthorPage } from "./pages/AuthorPage";

import { MyRecipesPage } from "./pages/MyRecipesPage";
import { RecipeEditorPage } from "./pages/RecipeEditorPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";

import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminSubmissions } from "./pages/admin/AdminSubmissions";
import { AdminRecipes } from "./pages/admin/AdminRecipes";
import { AdminComments } from "./pages/admin/AdminComments";
import { AdminComplaints } from "./pages/admin/AdminComplaints";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminUserDetail } from "./pages/admin/AdminUserDetail";
import { AdminTaxonomy } from "./pages/admin/AdminTaxonomy";

function NotFound() {
  return (
    <div className="center pad">
      <h1>404</h1>
      <p className="muted">Page not found.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Guest */}
        <Route index element={<CatalogPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="smart-selection" element={<SmartSelectionPage />} />
        <Route path="recipes/:idOrSlug" element={<RecipeDetailPage />} />
        <Route path="authors/:id" element={<AuthorPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        {/* Registered */}
        <Route
          path="recommendations"
          element={
            <RequireAuth>
              <RecommendationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="my-recipes"
          element={
            <RequireAuth>
              <MyRecipesPage />
            </RequireAuth>
          }
        />
        <Route
          path="my-recipes/new"
          element={
            <RequireAuth>
              <RecipeEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="my-recipes/:id/edit"
          element={
            <RequireAuth>
              <RecipeEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="favorites"
          element={
            <RequireAuth>
              <FavoritesPage />
            </RequireAuth>
          }
        />
        <Route
          path="history"
          element={
            <RequireAuth>
              <HistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="subscriptions"
          element={
            <RequireAuth>
              <SubscriptionsPage />
            </RequireAuth>
          }
        />
        <Route
          path="notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="submissions" element={<AdminSubmissions />} />
          <Route path="recipes" element={<AdminRecipes />} />
          <Route path="comments" element={<AdminComments />} />
          <Route path="complaints" element={<AdminComplaints />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="taxonomy" element={<AdminTaxonomy />} />
        </Route>

        <Route path="404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
