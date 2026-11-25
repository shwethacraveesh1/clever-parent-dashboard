import { Navigate, Route, Routes } from 'react-router-dom';
import CheckEmailPage from './pages/CheckEmailPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import VerifyPage from './pages/VerifyPage.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="brand">
          Clever Parent Dashboard
        </a>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/:studentId" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
