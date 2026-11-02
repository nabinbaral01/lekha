import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session';
import { AppShell, FundLayout } from './components/Layout';
import { Spinner } from './components/ui';
import { Home, Login, SourcePage } from './pages/Home';
import VoucherEntry from './pages/VoucherEntry';
import { VoucherList, VoucherView } from './pages/Vouchers';
import { BudgetStatement, CashBook, ConsolidatedCashBook, FundDashboard, NextPhase, TdsPage } from './pages/Reports';
import Admin, { AuditPage } from './pages/Admin';

export default function App() {
  const { user, loading, can } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="f/:source" element={<SourcePage />} />
        <Route path="f/:source/:nature" element={<FundLayout />}>
          <Route index element={<FundDashboard />} />
          {can.write && <Route path="vouchers/new" element={<VoucherEntry />} />}
          {can.write && <Route path="vouchers/:id/edit" element={<VoucherEntry />} />}
          <Route path="vouchers" element={<VoucherList />} />
          <Route path="vouchers/:id" element={<VoucherView />} />
          <Route path="cash-book" element={<CashBook />} />
          <Route path="budget-statement" element={<BudgetStatement />} />
          <Route path="tds" element={<TdsPage />} />
          <Route path="budget-ledger" element={<NextPhase titleKey="nav.budgetLedger" />} />
          <Route path="advance" element={<NextPhase titleKey="nav.advance" />} />
          <Route path="reports" element={<NextPhase titleKey="nav.reports" />} />
        </Route>
        {(can.admin || user.role === 'AUDITOR') && <Route path="consolidated" element={<ConsolidatedCashBook />} />}
        {(can.admin || user.role === 'AUDITOR') && <Route path="audit" element={<AuditPage />} />}
        {can.admin && <Route path="admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
