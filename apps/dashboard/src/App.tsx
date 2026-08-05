import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { OnboardingGate } from './auth/OnboardingGate'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AdminRoute } from './auth/RoleRoute'
import { DashboardLayout } from './layouts/DashboardLayout'
import { ClientsPage } from './pages/ClientsPage'
import { CompanyPage } from './pages/CompanyPage'
import { ConversationsPage } from './pages/ConversationsPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { VehiclesPage } from './pages/VehiclesPage'
import { WizardPage } from './pages/WizardPage'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename === '/' ? undefined : basename}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<OnboardingGate />}>
            <Route path="onboarding" element={<WizardPage />} />
            <Route element={<DashboardLayout />}>
              <Route index element={<HomePage />} />
              <Route path="conversaciones" element={<ConversationsPage />} />
              <Route path="clientes" element={<ClientsPage />} />
              <Route path="vehiculos" element={<VehiclesPage />} />
              <Route path="historial" element={<HistoryPage />} />
              <Route element={<AdminRoute />}>
                <Route path="configuracion" element={<CompanyPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
