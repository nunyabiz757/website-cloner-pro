import { Routes, Route } from 'react-router-dom';
import { Toaster } from './components/ui/Toaster';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import PerformancePage from './pages/PerformancePage';
import OptimizationPage from './pages/OptimizationPage';
import PreviewPage from './pages/PreviewPage';
import ExportPage from './pages/ExportPage';
import { PerformanceReportPage } from './pages/PerformanceReportPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import GHLPastePage from './pages/GHLPastePage';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="dashboard/:projectId" element={<DashboardPage />} />
          <Route path="performance/:projectId" element={<PerformancePage />} />
          <Route path="performance/:projectId/report" element={<PerformanceReportPage />} />
          <Route path="optimization/:projectId" element={<OptimizationPage />} />
          <Route path="ai-assistant/:projectId" element={<AIAssistantPage />} />
          <Route path="preview/:projectId" element={<PreviewPage />} />
          <Route path="export/:projectId" element={<ExportPage />} />
          <Route path="ghl-paste" element={<GHLPastePage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
