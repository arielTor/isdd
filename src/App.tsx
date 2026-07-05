import {
  Building2,
  LayoutDashboard,
  History,
  Settings,
  ShieldCheck,
  Search,
  Bell,
  ChevronRight,
  ChevronDown,
  Globe,
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  Users,
  Lock,
  CheckCircle2,
  XCircle,
  Activity,
  BellRing,
  Mail,
  AlertTriangle,
  Edit2,
  RefreshCcw,
  Terminal,
  X,
  Upload,
  Eye,
  EyeOff,
  Menu,
  Bitcoin,
  Coins,
  LogOut,
  CreditCard,
  Image as ImageIcon,
  UploadCloud,
  Check,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, Fragment, useRef } from 'react';
import { MOCK_COMPANIES } from './mockData';
import { CURRENCY_SYMBOLS, Company, Bank, BankAccount, User, UserRole, WalletAlert, ExchangeRate, RoleDef, UserPermission } from './types';
import WidgetCanvas from './dashboard/WidgetCanvas';
import { SparklineChart } from './dashboard/widgets';
import type { SparkPoint } from './dashboard/widgets';
import { downloadExcel } from './exportCsv';
import UploadScreen from './UploadScreen';
import LoginScreen from './LoginScreen';
import PSPPage from './PSPPage';

// ── Logged-in user type ───────────────────────────────────────────────────────
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: { company_id: string; bank_id: string | null }[];
  // Populated from Entra SSO claims (absent for password logins).
  upn?: string;
  department?: string;
  jobTitle?: string;
}

// --- Exchange Rates Mock ---
const EXCHANGE_RATES: ExchangeRate[] = [
  { base_currency: 'EUR', target_currency: 'USD', rate: 1.08 },
  { base_currency: 'GBP', target_currency: 'USD', rate: 1.25 },
  { base_currency: 'ILS', target_currency: 'USD', rate: 0.27 },
  { base_currency: 'BTC', target_currency: 'USDT', rate: 64500.00 },
  { base_currency: 'ETH', target_currency: 'USDT', rate: 3150.00 },
];

const convertCurrency = (amount: number, from: string): { amount: number, label: string } | null => {
  if (from === 'USD' || from === 'USDT') return null;
  const isCrypto = ['BTC', 'ETH'].includes(from);
  const target = isCrypto ? 'USDT' : 'USD';
  const rateObj = EXCHANGE_RATES.find(r => r.base_currency === from && r.target_currency === target);
  if (!rateObj) return null;
  return {
    amount: amount * rateObj.rate,
    label: target
  };
};

// --- Types ---
type Page = 'dashboard' | 'companies' | 'psp' | 'users' | 'alerts' | 'upload' | 'branding' | 'diagnostics';

// Backdrop colour for a logo badge — admin picks this in Appearance so logos
// designed for light *or* dark backgrounds both render correctly.
const logoBgColor = (bg: string) => (bg === 'dark' ? '#0f172a' : bg === 'none' ? 'transparent' : '#ffffff');

// --- Sidebar Component ---

const Sidebar = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  activePage,
  onNavigate,
  authUser,
  onLogout,
  isOpen,
  onClose,
  brandName,
  brandLogo,
  brandLogoBg,
  companyLogos,
}: {
  companies: Company[],
  selectedCompanyId: string | null,
  onSelectCompany: (id: string | null) => void,
  activePage: Page,
  onNavigate: (page: Page) => void,
  authUser: AuthUser | null,
  onLogout: () => void,
  isOpen: boolean,
  onClose: () => void,
  brandName: string,
  brandLogo: string | null,
  brandLogoBg: string,
  companyLogos: Record<string, string>,
}) => {
  // Settings group starts collapsed; expand it if the user is already on a settings page.
  const settingsIds = ['users', 'alerts', 'upload', 'branding', 'diagnostics'];
  const [settingsOpen, setSettingsOpen] = useState(() => settingsIds.includes(activePage));
  // Nav grouped by purpose: workspace (daily views) vs settings (admin/config), each filtered by role
  const workspaceNav = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['Admin', 'Manager', 'Viewer'] },
    { id: 'psp', icon: CreditCard, label: 'Payment Providers', roles: ['Admin', 'Manager', 'Viewer'] },
  ].filter(item => !authUser || item.roles.includes(authUser.role));

  const settingsNav = [
    { id: 'users', icon: Users, label: 'User Management', roles: ['Admin'] },
    { id: 'alerts', icon: BellRing, label: 'Alert Center', roles: ['Admin', 'Manager'] },
    { id: 'upload', icon: Upload, label: 'Manual Data Upload', roles: ['Admin', 'Manager'] },
    { id: 'branding', icon: ImageIcon, label: 'Appearance', roles: ['Admin', 'Manager', 'Viewer'] },
    { id: 'diagnostics', icon: Terminal, label: 'Diagnostics', roles: ['Admin'] },
  ].filter(item => !authUser || item.roles.includes(authUser.role));

  // Deterministic company avatar (initials + colour) — gives each company a consistent "logo"
  const AVATAR_COLORS = [
    'bg-indigo-500/20 text-indigo-300',
    'bg-emerald-500/20 text-emerald-300',
    'bg-amber-500/20 text-amber-300',
    'bg-sky-500/20 text-sky-300',
    'bg-rose-500/20 text-rose-300',
    'bg-violet-500/20 text-violet-300',
  ];
  const companyColor = (name: string) =>
    AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const companyInitials = (name: string) =>
    name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Shared nav row — one structure for every menu item, so groups stay visually consistent
  const renderNavItem = (item: { id: string; icon: typeof LayoutDashboard; label: string }) => (
    <button
      key={item.id}
      onClick={() => { onNavigate(item.id as Page); onClose(); }}
      className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg transition-all text-sm font-medium ${
        activePage === item.id
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
          : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
      }`}
    >
      <item.icon size={17} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  );

  const sectionLabel = (text: string) => (
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-3">{text}</div>
  );

  const sidebarContent = (
    <div className="w-[84vw] max-w-[320px] md:w-64 h-full bg-sidebar-bg text-white flex flex-col">
      {/* Brand */}
      <div className="px-4 py-4 md:px-5 md:py-5 flex items-center justify-between border-b border-sidebar-border/70">
        <div className="flex items-center gap-3 min-w-0">
          {brandLogo ? (
            <div className={`w-12 h-12 md:w-[72px] md:h-[72px] rounded-xl flex items-center justify-center shrink-0 p-1 md:p-1.5 ${brandLogoBg === 'none' ? '' : 'ring-1 ring-black/5'}`} style={{ backgroundColor: logoBgColor(brandLogoBg) }}>
              <img src={brandLogo} alt={brandName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 md:w-[72px] md:h-[72px] bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-bold text-white text-lg md:text-2xl shadow-lg shadow-indigo-900/40 shrink-0">
              {(brandName?.[0] || 'L').toUpperCase()}
            </div>
          )}
          <div className="leading-tight min-w-0">
            <div className="text-base font-bold tracking-tight">{brandName}</div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Treasury</div>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-2 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
        >
          <X size={22} />
        </button>
      </div>

      {/* Scrollable: workspace nav + company switcher */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          {sectionLabel('Menu')}
          {workspaceNav.filter(item => item.id === 'dashboard').map(renderNavItem)}

          {/* Companies — always expanded, placed before Payment Providers.
             The header itself acts as "View All Companies". */}
          <button
            onClick={() => { onSelectCompany(null); onNavigate('companies'); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg transition-all text-sm font-medium ${
              activePage === 'companies' && selectedCompanyId === null
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
            }`}
          >
            <Building2 size={17} className="shrink-0" />
            <span className="truncate flex-1 text-left">Companies</span>
            <span className={`text-[10px] px-2 py-0.5 rounded ${activePage === 'companies' && selectedCompanyId === null ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>ALL</span>
          </button>

          <div className="ml-3 pl-3 border-l border-sidebar-border/70 space-y-1">
            {companies.map((company) => {
              const active = selectedCompanyId === company.id && activePage === 'companies';
              return (
                <button
                  key={company.id}
                  onClick={() => { onSelectCompany(company.id); onNavigate('companies'); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg transition-all cursor-pointer ${
                    active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-300 hover:bg-slate-700/40'
                  }`}
                >
                  {companyLogos[company.id] ? (
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 p-0.5" style={{ backgroundColor: '#ffffff' }}>
                      <img src={companyLogos[company.id]} alt={company.name} className="max-w-full max-h-full object-contain" />
                    </span>
                  ) : (
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${active ? 'bg-white/20 text-white' : companyColor(company.name)}`}>
                      {companyInitials(company.name)}
                    </span>
                  )}
                  <span className="text-sm font-medium flex-1 text-left truncate">{company.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${active ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
                    {company.banks.length}
                  </span>
                </button>
              );
            })}
          </div>

          {workspaceNav.filter(item => item.id !== 'dashboard').map(renderNavItem)}
        </div>
      </nav>

      {/* Settings group — collapsed by default, click the header to expand/collapse */}
      {settingsNav.length > 0 && (
        <div className="px-3 py-3 border-t border-sidebar-border/70 space-y-1">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 mb-1 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
          >
            {settingsOpen ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
            <span>Settings</span>
            {/* dot marks a hidden active settings page when collapsed */}
            {!settingsOpen && settingsIds.includes(activePage) && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-1" />}
          </button>
          {settingsOpen && settingsNav.map(renderNavItem)}
        </div>
      )}

      {/* User footer */}
      <div className="p-3 border-t border-sidebar-border/70">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold ring-1 ring-slate-500 shrink-0">
            {authUser?.name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="text-xs truncate flex-1 min-w-0">
            <div className="font-medium text-slate-200 truncate">{authUser?.name || 'Unknown'}</div>
            <div className="text-slate-500 truncate">
              {[authUser?.jobTitle, authUser?.department].filter(Boolean).join(' · ') || authUser?.role}
            </div>
          </div>
          {(!authUser || authUser.role === 'Admin' || authUser.role === 'Manager') && (
            <button
              onClick={() => { onNavigate('alerts'); onClose(); }}
              title="Notifications"
              className="text-slate-500 hover:text-indigo-300 transition-colors p-1.5 rounded-lg hover:bg-slate-700/40 shrink-0"
            >
              <Bell size={15} />
            </button>
          )}
          <button
            onClick={onLogout}
            title="Sign out"
            className="text-slate-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-slate-700/40 shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible on md+ */}
      <div className="hidden md:flex h-full shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — slide-in drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden flex">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
};

// --- User Management Components ---

const UserModal = ({
  user,
  isOpen,
  onClose,
  onSave,
  companies,
  roles,
}: {
  user?: User | null,
  isOpen: boolean,
  onClose: () => void,
  onSave: (user: User) => Promise<void>,
  companies: Company[],
  roles: RoleDef[],
}) => {
  const [formData, setFormData] = useState<Partial<User>>(user || {
    name: '',
    email: '',
    role: 'Viewer',
    status: 'Active',
    permissions: []
  });
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData(user);
    } else {
      setFormData({
        name: '',
        email: '',
        role: 'Viewer',
        status: 'Active',
        permissions: []
      });
    }
    setPassword('');
    setShowPw(false);
    setModalError('');
    setSaving(false);
  }, [user, isOpen]);

  const togglePermission = (companyId: string, bankId?: string) => {
    setFormData(prev => {
      const currentPermissions = prev.permissions || [];
      const existingIdx = currentPermissions.findIndex(p => p.companyId === companyId);
      
      if (existingIdx === -1) {
        // Add new company permission
        return {
          ...prev,
          permissions: [...currentPermissions, { companyId, bankIds: bankId ? [bankId] : [] }]
        };
      }

      const updated = [...currentPermissions];
      const permission = { ...updated[existingIdx] };

      if (!bankId) {
        // Toggle entire company (remove if exists)
        updated.splice(existingIdx, 1);
      } else {
        // Toggle specific bank
        const bankIdx = permission.bankIds.indexOf(bankId);
        if (bankIdx === -1) {
          permission.bankIds = [...permission.bankIds, bankId];
        } else {
          permission.bankIds = permission.bankIds.filter(id => id !== bankId);
        }
        
        if (permission.bankIds.length === 0) {
          // If no specific banks left, remove company permission
          updated.splice(existingIdx, 1);
        } else {
          updated[existingIdx] = permission;
        }
      }
      
      return { ...prev, permissions: updated };
    });
  };

  const isCompanySelected = (companyId: string) => 
    formData.permissions?.some(p => p.companyId === companyId);

  const isBankSelected = (companyId: string, bankId: string) => {
    const p = formData.permissions?.find(p => p.companyId === companyId);
    return p ? (p.bankIds.length === 0 || p.bankIds.includes(bankId)) : false;
  };

  const isFullCompanySelected = (companyId: string) => {
    const p = formData.permissions?.find(p => p.companyId === companyId);
    if (!p) return false;
    const company = companies.find(c => c.id === companyId);
    return p.bankIds.length === 0 || (company && p.bankIds.length === company.banks.length);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full sm:max-w-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800">{user ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                placeholder="john@smarttool.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role</label>
              <select 
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all bg-white"
              >
                <option value="Viewer">Viewer</option>
                <option value="Manager">Manager</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <p className="-mt-3 text-[11px] text-slate-400 flex items-start gap-1.5">
            <ShieldCheck size={13} className="text-slate-400 shrink-0 mt-0.5" />
            {ROLE_DESC[formData.role || 'Viewer']}
          </p>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {user ? 'Change Password' : 'Password'}
              {!user && <span className="text-red-500 ml-0.5">*</span>}
              {user && <span className="text-slate-400 normal-case font-normal ml-1">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setModalError(''); }}
                onInput={e => { setPassword((e.target as HTMLInputElement).value); setModalError(''); }}
                placeholder={user ? '••••••••' : 'Min. 8 characters'}
                className={`w-full pl-9 pr-10 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all ${!user && !password ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {roles.length > 0 && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase block tracking-wider">Assigned Roles</label>
              <p className="text-[11px] text-slate-400">A user gets the combined access of all assigned roles.</p>
              <div className="flex flex-wrap gap-2">
                {roles.map(r => {
                  const on = (formData.roleIds || []).includes(r.id);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setFormData(prev => ({ ...prev, roleIds: on ? (prev.roleIds || []).filter(id => id !== r.id) : [...(prev.roleIds || []), r.id] }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${on ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <span className={`w-4 h-4 rounded inline-flex items-center justify-center ${on ? 'bg-indigo-600 text-white' : 'border border-slate-300'}`}>{on && <Check size={11} />}</span>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-slate-500 uppercase block tracking-wider">Company & Bank Access</label>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {companies.map(company => (
                <div key={company.id} className="bg-slate-50/30">
                  <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                       <div className={`p-1.5 rounded-lg border ${isCompanySelected(company.id) ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                          <Building2 size={16} />
                       </div>
                       <div>
                          <span className="font-bold text-sm text-slate-700">{company.name}</span>
                          <p className="text-[10px] text-slate-400 font-medium">{company.banks.length} Banks Available</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => togglePermission(company.id)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        isCompanySelected(company.id) 
                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                      }`}
                    >
                      {isCompanySelected(company.id) ? 'Revoke' : 'Grant All'}
                    </button>
                  </div>
                  
                  {isCompanySelected(company.id) && (
                    <div className="px-6 pb-4 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        {company.banks.map(bank => (
                          <div 
                            key={bank.id}
                            onClick={() => togglePermission(company.id, bank.id)}
                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                              isBankSelected(company.id, bank.id)
                                ? 'bg-white border-indigo-200 shadow-sm'
                                : 'bg-slate-100/50 border-transparent opacity-60'
                            }`}
                          >
                             <span className="text-[11px] font-semibold text-slate-600 truncate mr-2">{bank.name}</span>
                             {isBankSelected(company.id, bank.id) ? (
                               <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                             ) : (
                               <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                             )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {modalError ? (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                <span>⚠</span> {modalError}
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 font-medium max-w-[200px]">
                * Permissions are immediately applied upon saving.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!formData.name || !formData.email) {
                  setModalError('Name and email are required.');
                  return;
                }
                if (!user && !password) {
                  setModalError('Password is required for new users.');
                  return;
                }
                setModalError('');
                setSaving(true);
                try {
                  await onSave({
                    ...formData,
                    id: user?.id || `u_${Date.now()}`,
                    lastActive: user?.lastActive || 'Never',
                    ...(password ? { password } : {}),
                  } as User);
                } catch (e: any) {
                  setModalError(e.message || 'Something went wrong. Please try again.');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={!formData.name || !formData.email || saving}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-lg shadow-slate-900/10 hover:bg-slate-800 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
            >
              {saving
                ? <><RefreshCcw size={14} className="animate-spin" />{user ? 'Saving…' : 'Creating…'}</>
                : user ? 'Update User' : 'Grant Access'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};


// --- User Management Page ---

const ROLE_DESC: Record<string, string> = {
  Admin: 'Full access to all companies, settings and user management.',
  Manager: 'Manage data and alerts for assigned companies.',
  Viewer: 'Read-only access to assigned companies.',
};

// Portal areas a role can be granted access to.
const PAGE_PERMS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'companies', label: 'Companies' },
  { id: 'psp', label: 'Payment Providers' },
  { id: 'alerts', label: 'Alert Center' },
  { id: 'upload', label: 'Manual Data Upload' },
];

// --- Entra Groups tab: map discovered Entra group Object IDs to roles ---
type EntraGroup = { groupId: string; label: string | null; lastSeen?: string; roleIds: string[] };

const EntraGroupsTab = ({ roles }: { roles: RoleDef[] }) => {
  const [groups, setGroups] = useState<EntraGroup[] | null>(null);
  const [samlEnabled, setSamlEnabled] = useState(true);
  const [addId, setAddId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () =>
    fetch('/api/entra/groups', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { groups: [] }))
      .then(d => { setGroups(d.groups || []); if (typeof d.samlEnabled === 'boolean') setSamlEnabled(d.samlEnabled); })
      .catch(() => setGroups([]));
  useEffect(() => { load(); }, []);

  const save = async (groupId: string, patch: Partial<Pick<EntraGroup, 'label' | 'roleIds'>>) => {
    setSavingId(groupId);
    setGroups(gs => gs ? gs.map(g => g.groupId === groupId ? { ...g, ...patch } : g) : gs);
    try {
      await fetch(`/api/entra/groups/${encodeURIComponent(groupId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(patch),
      });
    } catch { /* ignore */ } finally { setSavingId(null); }
  };

  const toggleRole = (g: EntraGroup, rid: string) => {
    const next = g.roleIds.includes(rid) ? g.roleIds.filter(x => x !== rid) : [...g.roleIds, rid];
    save(g.groupId, { roleIds: next });
  };

  const addGroup = async () => {
    const id = addId.trim();
    if (!id || groups?.some(g => g.groupId === id)) { setAddId(''); return; }
    setGroups(gs => [...(gs || []), { groupId: id, label: null, roleIds: [] }]);
    setAddId('');
    await save(id, { roleIds: [] });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Entra groups → roles</h3>
          <p className="text-xs text-slate-400 mt-1">
            Groups appear here automatically after a user signs in with Microsoft. Map each group to
            one or more roles — a user's access is the union of the roles from every group they belong to.
            Being in at least one mapped group is what grants access.
          </p>
        </div>

        {!samlEnabled && (
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>SSO is not configured on this environment yet (SAML env vars unset). You can still pre-map group Object IDs here; they take effect once SSO is enabled.</span>
          </div>
        )}

        {/* Add a group by Object ID */}
        <div className="flex items-center gap-2">
          <input
            value={addId}
            onChange={e => setAddId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGroup(); }}
            placeholder="Add a group by Object ID (GUID)"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
          />
          <button onClick={addGroup} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {groups === null ? (
        <div className="text-center text-slate-400 py-10 text-sm">Loading groups…</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          <ShieldCheck size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No groups discovered yet</p>
          <p className="text-xs mt-1">They appear after someone signs in with Microsoft, or add one by its Object ID above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.groupId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <input
                    defaultValue={g.label || ''}
                    onBlur={e => { const v = e.target.value.trim(); if (v !== (g.label || '')) save(g.groupId, { label: v }); }}
                    placeholder="Add a friendly name…"
                    className="text-sm font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none w-64 max-w-full"
                  />
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">{g.groupId}</div>
                </div>
                <span className="text-[11px] text-slate-400">
                  {g.roleIds.length ? `${g.roleIds.length} role${g.roleIds.length > 1 ? 's' : ''}` : 'No roles — no access'}
                  {savingId === g.groupId && ' · saving…'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {roles.map(r => {
                  const on = g.roleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRole(g, r.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
                    >
                      {on && <Check size={12} />} {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- User Management (Users + Roles tabs) ---
const UserManagementPage = ({
  users,
  onAddUser,
  onEditUser,
  onDeleteUser,
  companies,
  currentUserId,
  roles,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
}: {
  users: User[],
  onAddUser: () => void,
  onEditUser: (user: User) => void,
  onDeleteUser: (id: string) => void,
  companies: Company[],
  currentUserId?: string,
  roles: RoleDef[],
  onCreateRole: (name: string) => Promise<void>,
  onUpdateRole: (role: RoleDef) => Promise<void>,
  onDeleteRole: (id: string) => Promise<void>,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'users' | 'roles' | 'groups'>('users');
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [roleError, setRoleError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roleBadge = (role: string) =>
    role === 'Admin' ? 'bg-indigo-100 text-indigo-700' :
    role === 'Manager' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';

  const initials = (name: string) => name.split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const saveRoleAccess = async (roleId: string, permissions: UserPermission[]) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    setSavingRoleId(roleId);
    try { await onUpdateRole({ ...role, permissions }); }
    catch (e) { console.error('Role access update failed', e); }
    finally { setSavingRoleId(null); }
  };

  const togglePage = async (role: RoleDef, pageId: string) => {
    if (role.name === 'Admin') return; // admin can open everything
    const pages = (role.pages || []).includes(pageId)
      ? role.pages.filter(p => p !== pageId)
      : [...(role.pages || []), pageId];
    setSavingRoleId(role.id);
    try { await onUpdateRole({ ...role, pages }); }
    catch (e) { console.error('Role page update failed', e); }
    finally { setSavingRoleId(null); }
  };

  // Per-role company/bank access helpers (used by the role editor)
  const rolePermFor = (role: RoleDef, cid: string) => role.permissions.find(p => p.companyId === cid);
  const roleCompanyState = (role: RoleDef, cid: string): 'all' | 'partial' | 'none' => {
    if (role.name === 'Admin') return 'all';
    const p = rolePermFor(role, cid);
    if (!p) return 'none';
    return p.bankIds.length === 0 ? 'all' : 'partial';
  };
  const roleBankOn = (role: RoleDef, cid: string, bid: string) => {
    const p = rolePermFor(role, cid);
    if (!p) return false;
    return p.bankIds.length === 0 || p.bankIds.includes(bid);
  };
  const setRoleCompanyAll = (role: RoleDef, cid: string, all: boolean) =>
    saveRoleAccess(role.id, all
      ? [...role.permissions.filter(p => p.companyId !== cid), { companyId: cid, bankIds: [] }]
      : role.permissions.filter(p => p.companyId !== cid));
  const toggleRoleBank = (role: RoleDef, cid: string, bid: string) => {
    const company = companies.find(c => c.id === cid);
    const allIds = (company?.banks || []).map(b => b.id);
    const p = rolePermFor(role, cid);
    let bankIds: string[];
    if (!p) bankIds = [bid];
    else if (p.bankIds.length === 0) bankIds = allIds.filter(id => id !== bid);
    else bankIds = p.bankIds.includes(bid) ? p.bankIds.filter(id => id !== bid) : [...p.bankIds, bid];
    let permissions;
    if (bankIds.length === 0) permissions = role.permissions.filter(p => p.companyId !== cid);
    else if (allIds.length > 0 && bankIds.length === allIds.length) permissions = [...role.permissions.filter(p => p.companyId !== cid), { companyId: cid, bankIds: [] }];
    else permissions = [...role.permissions.filter(p => p.companyId !== cid), { companyId: cid, bankIds }];
    saveRoleAccess(role.id, permissions);
  };

  const handleCreateRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    setCreating(true); setRoleError('');
    try { await onCreateRole(name); setNewRoleName(''); }
    catch (e: any) { setRoleError(e.message || 'Failed to create role'); }
    finally { setCreating(false); }
  };

  const handleDeleteRole = async (id: string) => {
    try { await onDeleteRole(id); }
    catch (e) { console.error('Role delete failed', e); }
  };

  return (
    <div className="w-full max-w-[2000px] mx-auto p-4 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h2>
          <p className="text-sm text-slate-500 mt-1">Manage users, roles and company access.</p>
        </div>
        {tab === 'users' && (
          <button onClick={onAddUser} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2">
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([['users', 'Users'], ['roles', 'Roles'], ['groups', 'Entra Groups']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'users' ? (
        <>
          {/* Users table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-400" />
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Users</h3>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search users…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 w-56 transition-all" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[680px]">
                <thead className="bg-slate-50/30 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-3 border-b border-slate-100">User</th>
                    <th className="px-6 py-3 border-b border-slate-100">Role</th>
                    <th className="px-6 py-3 border-b border-slate-100">Status</th>
                    <th className="px-6 py-3 border-b border-slate-100">Access</th>
                    <th className="px-6 py-3 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50">
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-500 border border-slate-200 text-xs shrink-0">{initials(user.name)}</div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 leading-none truncate">{user.name}</p>
                            <p className="text-[11px] text-slate-400 mt-1 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(user.roleIds && user.roleIds.length > 0) ? (
                          <div className="flex flex-wrap gap-1">
                            {user.roleIds.map(rid => {
                              const r = roles.find(x => x.id === rid);
                              const nm = r?.name || rid;
                              return <span key={rid} className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${roleBadge(nm)}`}>{nm}</span>;
                            })}
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${roleBadge(user.role)}`}>{user.role}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.role === 'Admin' ? (
                          <span className="text-[11px] font-semibold text-indigo-600">All companies</span>
                        ) : user.permissions.length === 0 ? (
                          <span className="text-[11px] text-slate-400">No access</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.permissions.map(p => {
                              const c = companies.find(c => c.id === p.companyId);
                              return <span key={p.companyId} className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-600">{c?.name || p.companyId}{p.bankIds.length ? ` (${p.bankIds.length})` : ''}</span>;
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onEditUser(user)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1.5"><Edit2 size={14} /> Edit</button>
                          <button onClick={() => onDeleteUser(user.id)} disabled={user.id === currentUserId} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" title={user.id === currentUserId ? 'You cannot remove yourself' : 'Remove user'}><XCircle size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : tab === 'roles' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: create + role list */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Create a role</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRoleName}
                  onChange={e => { setNewRoleName(e.target.value); setRoleError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateRole(); }}
                  placeholder="e.g. Treasury Analyst"
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
                <button onClick={handleCreateRole} disabled={creating || !newRoleName.trim()} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shrink-0"><Plus size={16} /></button>
              </div>
              {roleError && <p className="text-xs text-red-600 mt-2">{roleError}</p>}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase tracking-widest">Roles ({roles.length})</div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-50">
                {roles.map(role => {
                  const active = (selectedRoleId || roles[0]?.id) === role.id;
                  return (
                    <button key={role.id} onClick={() => setSelectedRoleId(role.id)} className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${active ? 'bg-indigo-600' : 'hover:bg-slate-50'}`}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? 'bg-white' : role.name === 'Admin' ? 'bg-indigo-500' : role.name === 'Manager' ? 'bg-emerald-500' : role.name === 'Viewer' ? 'bg-slate-400' : 'bg-violet-500'}`} />
                      <span className={`text-sm font-semibold truncate ${active ? 'text-white' : 'text-slate-800'}`}>{role.name}</span>
                      <span className={`ml-auto text-[10px] shrink-0 ${active ? 'text-white/70' : 'text-slate-400'}`}>{role.builtin ? 'Built-in' : 'Custom'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: selected role editor */}
          <div className="lg:col-span-2">
            {(() => {
              const role = roles.find(r => r.id === selectedRoleId) || roles[0];
              if (!role) return <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">No roles yet — create one on the left.</div>;
              const locked = role.name === 'Admin';
              return (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${role.name === 'Admin' ? 'bg-indigo-500' : role.name === 'Manager' ? 'bg-emerald-500' : role.name === 'Viewer' ? 'bg-slate-400' : 'bg-violet-500'}`} />
                      <h3 className="text-lg font-bold text-slate-900 truncate">{role.name}</h3>
                      <span className="text-[11px] text-slate-400 shrink-0">{role.builtin ? 'Built-in role' : 'Custom role'}</span>
                      {savingRoleId === role.id && <RefreshCcw size={13} className="animate-spin text-slate-400 shrink-0" />}
                    </div>
                    {!role.builtin && <button onClick={() => { handleDeleteRole(role.id); setSelectedRoleId(null); }} className="text-xs font-semibold text-slate-400 hover:text-red-600 flex items-center gap-1 shrink-0"><XCircle size={14} /> Delete</button>}
                  </div>

                  <div className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-800 mb-1">Page access</p>
                    <p className="text-xs text-slate-400 mb-3">Which areas of the portal this role can open.{locked && ' Admins can open everything.'}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {PAGE_PERMS.map(p => {
                        const on = locked || (role.pages || []).includes(p.id);
                        return (
                          <button key={p.id} onClick={() => togglePage(role, p.id)} disabled={locked || savingRoleId === role.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm font-medium transition-colors ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'} ${locked ? 'opacity-70 cursor-not-allowed' : ''}`}>
                            <span className={`w-4 h-4 rounded inline-flex items-center justify-center shrink-0 ${on ? 'bg-white text-indigo-600' : 'border border-slate-300'}`}>{on && <Check size={11} />}</span>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-800 mb-1">Company &amp; bank access</p>
                    <p className="text-xs text-slate-400 mb-3">Which companies and banks this role can see.{locked && ' Admins always have full access.'}</p>
                    {companies.length === 0 ? <p className="text-xs text-slate-400">No companies available.</p> : (
                      <div className="space-y-2">
                        {companies.map(c => {
                          const st = roleCompanyState(role, c.id);
                          return (
                            <div key={c.id} className="border border-slate-200 rounded-lg p-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-700">{c.name}</span>
                                <div className="flex items-center gap-1.5">
                                  <button disabled={locked} onClick={() => setRoleCompanyAll(role, c.id, true)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${st === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}>All banks</button>
                                  <button disabled={locked} onClick={() => setRoleCompanyAll(role, c.id, false)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${st === 'none' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}>None</button>
                                </div>
                              </div>
                              {!locked && (c.banks || []).length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                                  {(c.banks || []).map(bank => {
                                    const on = roleBankOn(role, c.id, bank.id);
                                    return (
                                      <button key={bank.id} onClick={() => toggleRoleBank(role, c.id, bank.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${on ? 'bg-white border-indigo-200 text-slate-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                                        <span className={`w-4 h-4 rounded inline-flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 text-white' : 'border border-slate-300'}`}>{on && <Check size={11} />}</span>
                                        <span className="truncate font-medium">{bank.name}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <EntraGroupsTab roles={roles} />
      )}
    </div>
  );
};

// --- Alerts Page Component ---

const AlertsPage = ({
  companies, 
  alerts, 
  onAddAlert, 
  onDeleteAlert,
  onToggleAlert
}: { 
  companies: Company[], 
  alerts: WalletAlert[], 
  onAddAlert: (newAlert: Partial<WalletAlert>) => void,
  onDeleteAlert: (id: string) => void,
  onToggleAlert: (id: string) => void
}) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [threshold, setThreshold] = useState('');
  const [email, setEmail] = useState('');
  const [applyToAllInBank, setApplyToAllInBank] = useState(false);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  const selectedBank = selectedCompany?.banks.find(b => b.id === selectedBankId);

  const handleAdd = () => {
    if (!selectedCompanyId || !selectedBankId || (!selectedWalletId && !applyToAllInBank) || !threshold || !email) return;

    if (applyToAllInBank && selectedBank) {
      const accs = selectedBank.bank_accounts || selectedBank.accounts || [];
      const wallets = accs.flatMap(acc => acc.wallets || []);
      wallets.forEach(w => {
        onAddAlert({
          companyId: selectedCompanyId,
          bankId: selectedBankId,
          walletId: w.id,
          threshold: parseFloat(threshold),
          email,
          isEnabled: true
        });
      });
    } else {
      onAddAlert({
        companyId: selectedCompanyId,
        bankId: selectedBankId,
        walletId: selectedWalletId,
        threshold: parseFloat(threshold),
        email,
        isEnabled: true
      });
    }

    // Reset fields
    setThreshold('');
    setEmail('');
    setApplyToAllInBank(false);
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Wallet Alerts</h2>
          <p className="text-sm text-slate-500 mt-1">Configure threshold monitoring and email notifications</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configure Alert Form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-fit">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Monitoring Rule</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Company</label>
              <select 
                value={selectedCompanyId} 
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value);
                  setSelectedBankId('');
                  setSelectedWalletId('');
                }}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all bg-white text-sm"
              >
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bank</label>
              <select 
                value={selectedBankId} 
                disabled={!selectedCompanyId}
                onChange={(e) => {
                  setSelectedBankId(e.target.value);
                  setSelectedWalletId('');
                }}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all bg-white text-sm disabled:opacity-50"
              >
                <option value="">Select Bank</option>
                {selectedCompany?.banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Wallet</label>
              <select 
                value={selectedWalletId} 
                disabled={!selectedBankId || applyToAllInBank}
                onChange={(e) => setSelectedWalletId(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all bg-white text-sm disabled:opacity-50"
              >
                <option value="">Select Wallet</option>
                {(selectedBank?.bank_accounts || selectedBank?.accounts || []).flatMap(acc => acc.wallets || []).map(w => (
                  <option key={w.id} value={w.id}>{w.id} ({w.currency})</option>
                ))}
              </select>
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="applyToAll"
                  checked={applyToAllInBank}
                  onChange={(e) => setApplyToAllInBank(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="applyToAll" className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer">Apply to all wallets in bank</label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Threshold Amount</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Alert Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alerts@company.com"
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <button 
              onClick={handleAdd}
              disabled={(!selectedWalletId && !applyToAllInBank) || !threshold || !email}
              className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-lg shadow-slate-900/10 hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
            >
              <BellRing size={16} />
              Set Active Alert
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-slate-400" />
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Monitors</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/30 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-100">Resource</th>
                  <th className="px-6 py-4 border-b border-slate-100">Threshold</th>
                  <th className="px-6 py-4 border-b border-slate-100">Notifications</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-50">
                {alerts.map((alert) => {
                  const company = companies.find(c => c.id === alert.companyId);
                  const bank = company?.banks.find(b => b.id === alert.bankId);
                  return (
                    <tr key={alert.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded-lg border border-slate-200">
                             <Building2 size={14} className="text-slate-500" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-none truncate max-w-[150px]">{company?.name}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{bank?.name} • {alert.walletId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <AlertTriangle size={14} className="text-amber-500" />
                           <span className="font-mono font-bold text-slate-700">≤ {alert.threshold.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <Mail size={12} className="text-slate-400" />
                           <span className="text-[11px] text-slate-600 font-medium">{alert.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => onToggleAlert(alert.id)}
                            className={`p-2 rounded-lg transition-colors ${alert.isEnabled ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-50'}`}
                            title={alert.isEnabled ? 'Disable Alert' : 'Enable Alert'}
                          >
                            <ShieldCheck size={18} />
                          </button>
                          <button 
                            onClick={() => onDeleteAlert(alert.id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                            title="Remove Alert"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                      No monitoring rules configured. Use the form to your left to start securing wallets.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- SparklineChart Component (with hover tooltip) ---

// SparklineChart + SparkPoint now live in ./dashboard/widgets and are imported above.

// --- Header Component ---

const Header = ({
  title, searchTerm, onSearch, onMenuClick, logo,
}: {
  title: string;
  searchTerm: string;
  onSearch: (val: string) => void;
  onMenuClick: () => void;
  logo?: string | null;
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0 gap-3 h-16 md:h-20">
      {/* Left — hamburger + company logo + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        {logo && (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 p-1 ring-1 ring-black/5" style={{ backgroundColor: '#ffffff' }}>
            <img src={logo} alt={title} className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-none truncate">{title}</h1>
      </div>

      {/* Right — search (notifications + sign out now live in the sidebar user section) */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            className="w-32 md:w-48 h-8 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
        </div>
      </div>
    </header>
  );
};

// --- Bank Card ---

const BankDetailsModal = ({ 
  bank, 
  isOpen, 
  onClose,
  alerts
}: { 
  bank: Bank | null, 
  isOpen: boolean, 
  onClose: () => void,
  alerts: WalletAlert[]
}) => {
  if (!isOpen || !bank) return null;

  const accounts = bank.bank_accounts || bank.accounts || [];
  const allWallets = (accounts || []).flatMap(acc => {
    let wallets = acc.wallets || [];
    if (typeof wallets === 'string') try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
    return Array.isArray(wallets) ? wallets : [];
  });

  const bankHasActiveAlert = allWallets.some(wallet => {
    const alert = alerts.find(a => a.bankId === bank.id && a.walletId === wallet.id && a.isEnabled);
    return alert ? (wallet.balance || 0) <= alert.threshold : false;
  });

  const shouldHighlightRow = (walletId: string) => {
    const hasAlertConfigured = alerts.some(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
    const alert = alerts.find(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
    const wallet = allWallets.find(w => w.id === walletId);
    const triggeredLocally = alert && wallet && (wallet.balance || 0) <= alert.threshold;
    return triggeredLocally || (bankHasActiveAlert && hasAlertConfigured);
  };

  const totalUsd = allWallets.reduce((sum, wallet) => sum + (wallet.value_usd || 0), 0);

  const currencyTotals = allWallets.reduce((acc, wallet) => {
    acc[wallet.currency] = (acc[wallet.currency] || 0) + (wallet.balance || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full sm:max-w-xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Building2 size={20} />
             </div>
             <div>
                <h3 className="font-bold text-slate-800 leading-none">{bank.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{bank.country}</p>
                   {bank.last_modified_date && (
                     <>
                       <span className="text-slate-300">•</span>
                       <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Last Sync: {bank.last_modified_date}</p>
                     </>
                   )}
                </div>
             </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Total USD value across all wallets */}
            {totalUsd > 0 && (
              <div className="col-span-2 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total USD Value</p>
                <p className="text-2xl font-bold text-indigo-700 font-mono">
                  ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {Object.entries(currencyTotals).map(([currency, total]) => (
              <div key={currency} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total {currency}</p>
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {CURRENCY_SYMBOLS[currency] || ''} {total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <WalletIcon size={14} className="text-slate-400" />
                Wallet Breakdown
             </h4>
             <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50">
                {accounts.map(account => {
                  let wallets = account.wallets || [];
                  if (typeof wallets === 'string') try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
                  const walletsArray = Array.isArray(wallets) ? wallets : [];
                  
                  return (
                    <div key={account.id} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Account: {account.account_number || account.accountNumber}</span>
                      </div>
                      <div className="space-y-2">
                        {walletsArray.map(wallet => {
                          const hasDbUsd = wallet.value_usd !== undefined && wallet.value_usd !== null && wallet.value_usd !== 0;
                          const isEstimated = !!(wallet as any).value_usd_estimated;
                          return (
                            <div key={wallet.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-lg border border-slate-100/50">
                              <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold
                                    ${wallet.currency === 'BTC' || wallet.currency === 'ETH' ? 'bg-orange-100 text-orange-700' :
                                      wallet.currency === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {wallet.currency}
                                  </span>
                                  <span className="text-xs font-medium text-slate-500 font-mono truncate max-w-[120px]">{wallet.id}</span>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold font-mono tracking-tight ${shouldHighlightRow(wallet.id) ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>
                                   {CURRENCY_SYMBOLS[wallet.currency] || ''} {(wallet.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                                {hasDbUsd && (() => {
                                  const neg = (wallet.value_usd ?? 0) < 0;
                                  const abs = Math.abs(wallet.value_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                                  return (
                                    <p className={`text-[10px] font-mono font-bold ${neg ? 'text-red-500' : 'text-slate-500'}`}>
                                      {neg ? '-' : ''}${abs}
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 text-right">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all"
          >
            Close Drilldown
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const BankCard = ({ bank, onShowDetails, alerts }: { bank: Bank, onShowDetails: (bank: Bank) => void, alerts: WalletAlert[] }) => {
  const accounts = bank.bank_accounts || bank.accounts || [];
  const allWallets = (accounts || []).flatMap(acc => {
    let wallets = acc.wallets || [];
    if (typeof wallets === 'string') try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
    return Array.isArray(wallets) ? wallets : [];
  });

  const bankHasActiveAlert = allWallets.some(wallet => {
    const alert = alerts.find(a => a.bankId === bank.id && a.walletId === wallet.id && a.isEnabled);
    return alert ? (wallet.balance || 0) <= alert.threshold : false;
  });

  const shouldHighlightRow = (walletId: string) => {
    const hasAlertConfigured = alerts.some(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
    const alert = alerts.find(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
    const wallet = allWallets.find(w => w.id === walletId);
    const triggeredLocally = alert && wallet && (wallet.balance || 0) <= alert.threshold;
    
    // Highlight if this wallet triggered its alert OR if any triggered alert in bank impacts this monitored wallet
    return triggeredLocally || (bankHasActiveAlert && hasAlertConfigured);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border bg-white ${bankHasActiveAlert ? 'border-red-400 ring-2 ring-red-500/20 shadow-red-500/10' : 'border-slate-200'}`}
    >
      <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {bank.name}
              </h3>
              {(bank.isVerified || bank.is_verified === 1 || bank.is_verified === "1") && <ShieldCheck size={12} className="text-emerald-500" />}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">{bank.country}</span>
          {bank.last_modified_date && (
            <span className="text-[9px] text-indigo-500 font-bold uppercase block mt-0.5 whitespace-nowrap">Updated: {bank.last_modified_date}</span>
          )}
        </div>
      </div>

      <div className="p-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase">
            <tr>
              <th className="px-5 py-2 border-b border-slate-100">Wallet</th>
              <th className="px-5 py-2 border-b border-slate-100 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {allWallets.map((wallet) => (
              <tr key={wallet.id} className={`${shouldHighlightRow(wallet.id) ? 'bg-red-50/70' : 'hover:bg-slate-50'} transition-colors group`}>
                <td className={`px-5 py-3 border-b ${shouldHighlightRow(wallet.id) ? 'border-red-100' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold 
                      ${wallet.currency === 'BTC' || wallet.currency === 'ETH' ? 'bg-orange-100 text-orange-700' : 
                        wallet.currency === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {wallet.currency}
                    </span>
                  </div>
                </td>
                <td className={`px-5 py-3 border-b ${shouldHighlightRow(wallet.id) ? 'border-red-100' : 'border-slate-100'} text-right font-mono font-bold ${shouldHighlightRow(wallet.id) ? 'text-red-600 animate-pulse' : 'text-slate-700'}`}>
                  <div className="flex flex-col items-end">
                    <span>{CURRENCY_SYMBOLS[wallet.currency] || ''} {wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    {convertCurrency(wallet.balance, wallet.currency) && (
                      <span className="text-[9px] text-slate-400 italic">
                        ≈ {convertCurrency(wallet.balance, wallet.currency)?.label} {convertCurrency(wallet.balance, wallet.currency)?.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 flex justify-end bg-slate-50/30">
        <button 
          onClick={() => onShowDetails(bank)}
          className="text-xs font-bold flex items-center gap-1 group text-indigo-600 hover:text-indigo-700"
        >
          Details <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
};

// --- Company detail (rendered as tabs under "View All Companies") ---

const CompanyDetailCard = ({
  company,
  alerts,
  onShowBankDetails,
}: {
  company: Company;
  alerts: WalletAlert[];
  onShowBankDetails: (bank: Bank) => void;
}) => {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4 border-b border-slate-100">Bank</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Wallets</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Balance (LCY)</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Currency</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Valuation (USD/T)</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {(company.banks || []).flatMap(bank => {
              // 1. Determine verification status (prioritizing is_verified underscore field)
              const isVerified = bank.is_verified !== undefined
                ? (bank.is_verified === 1 || bank.is_verified === "1" || bank.is_verified === true)
                : (bank.isVerified === true || (bank.isVerified as any) === 1);

              if (!isVerified) {
                return [];
              }

              // 2. Get all accounts for this bank (with defensive parsing for stringified JSON from DB)
              let accounts: BankAccount[] = [];
              const rawAccounts = bank.bank_accounts || bank.accounts;
              try {
                if (Array.isArray(rawAccounts)) {
                  accounts = rawAccounts;
                } else if (typeof rawAccounts === 'string') {
                  accounts = JSON.parse(rawAccounts);
                }
              } catch (e) {
                console.error("Failed to parse accounts for bank:", bank.name, e);
              }

              // 2. Identify active accounts (those with wallets)
              const activeAccounts = accounts.filter(acc => {
                let wallets = acc.wallets || [];
                if (typeof wallets === 'string') {
                  try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
                }
                return Array.isArray(wallets) && wallets.length > 0;
              });

              // 3. Handle banks with absolutely no detected accounts
              if (accounts.length === 0) {
                return [];
              }

              // 4. Transform active accounts into wallet rows
              const activeRows = activeAccounts.flatMap(acc => {
                let wallets = acc.wallets || [];
                if (typeof wallets === 'string') {
                  try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
                }
                return (wallets as any[]).map((w) => ({
                  ...w,
                  accountNumber: acc.account_number || acc.accountNumber,
                  bankName: bank.name,
                  isVerified: isVerified,
                  lastSync: bank.last_modified_date
                }));
              });

              // 5. Identify accounts with no wallets
              const inactiveAccounts = accounts.filter(acc => {
                let wallets = acc.wallets || [];
                if (typeof wallets === 'string') {
                  try { wallets = JSON.parse(wallets); } catch(e) { wallets = []; }
                }
                return !wallets || wallets.length === 0;
              });

              // 6. Generate JSX rows
              const resultRows: any[] = [];

              // Add active rows (Wallets)
              activeRows.forEach((wallet, idx) => {
                const usdVal = wallet.value_usd ?? (wallet as any).usd_value ?? (wallet as any).valueUsd ?? (wallet as any).usdValue;
                // Allow negative values (overdrafts) — only hide when truly absent or exactly zero balance with no DB value
                const converted = (usdVal !== undefined && usdVal !== null && Number(usdVal) !== 0)
                  ? { amount: Number(usdVal), estimated: !!(wallet as any).value_usd_estimated }
                  : null;
                const isFirstInBank = idx === 0;

                const bankHasActiveAlert = accounts.flatMap(acc => acc.wallets || []).some(w => {
                  const alert = alerts.find(a => a.bankId === bank.id && a.walletId === w.id && a.isEnabled);
                  return alert ? (w.balance || 0) <= alert.threshold : false;
                });

                const shouldHighlight = (walletId: string) => {
                  const hasAlertConfigured = alerts.some(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
                  const alert = alerts.find(a => a.bankId === bank.id && a.walletId === walletId && a.isEnabled);
                  const triggeredLocally = alert && (wallet.balance || 0) <= alert.threshold;
                  return triggeredLocally || (bankHasActiveAlert && hasAlertConfigured);
                };

                const isAlertRow = shouldHighlight(wallet.id);

                resultRows.push(
                  <tr key={`${bank.id}-${wallet.id}-${idx}`} className={`transition-colors group ${isAlertRow ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50/50'}`}>
                    <td className={`px-6 py-4 border-b border-slate-100 ${isAlertRow ? 'border-red-100' : ''}`}>
                      {isFirstInBank ? (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{bank.name}</span>
                            {isVerified && <ShieldCheck size={12} className="text-emerald-500" />}
                          </div>
                          {wallet.lastSync && (
                            <span className="text-[9px] text-indigo-500 font-bold uppercase mt-1 tracking-tight">Sync: {wallet.lastSync}</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-300 font-medium ml-2">↳ Continued</div>
                      )}
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right text-slate-500 text-xs font-mono font-medium">{wallet.accountNumber}</td>
                    <td className={`px-6 py-4 border-b border-slate-100 text-right font-mono font-bold ${isAlertRow ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>
                      {CURRENCY_SYMBOLS[wallet.currency] || ''} {(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${wallet.currency === 'USD' || wallet.currency === 'USDT' ? 'bg-emerald-100 text-emerald-700' : wallet.currency === 'BTC' || wallet.currency === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {wallet.currency}
                      </span>
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right font-mono">
                      {converted ? (() => {
                        const neg = converted.amount < 0;
                        const abs = Math.abs(converted.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        return (
                          <span className={`font-bold text-sm ${neg ? 'text-red-600' : 'text-slate-900'}`}>
                            {neg ? '-' : ''}${abs}
                          </span>
                        );
                      })() : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              });

              // Add inactive rows
              inactiveAccounts.forEach((acc, idx) => {
                const isFirstInBank = activeRows.length === 0 && idx === 0;
                resultRows.push(
                  <tr key={`${bank.id}-${acc.accountNumber}-${idx}`} className="hover:bg-slate-50/50 grayscale opacity-60">
                    <td className="px-6 py-4 border-b border-slate-100">
                      {isFirstInBank ? (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{bank.name}</span>
                            {isVerified && <ShieldCheck size={12} className="text-emerald-500" />}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-300 font-medium ml-2">↳ {activeRows.length > 0 ? "Additional Acct" : "Continued"}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right text-slate-400 text-xs font-mono">{acc.accountNumber}</td>
                    <td colSpan={3} className="px-6 py-4 border-b border-slate-100 text-right text-slate-400 italic text-xs">
                      {/* Hidden */}
                    </td>
                  </tr>
                );
              });

              return resultRows;
            })}
          </tbody>
        </table>
      </div>
      <div className="p-4 bg-slate-50/30 flex justify-end">
        {company.banks && company.banks.length > 0 && (
          <button
            onClick={() => onShowBankDetails(company.banks[0])}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group"
          >
            Full Ledger View <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};

const CompanyTabs = ({
  companies,
  alerts,
  onShowBankDetails,
}: {
  companies: Company[];
  alerts: WalletAlert[];
  onShowBankDetails: (bank: Bank) => void;
}) => {
  const [activeId, setActiveId] = useState<string | null>(companies[0]?.id ?? null);
  const active = companies.find(c => c.id === activeId) || companies[0];
  if (!active) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab bar — one tab per company */}
      <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-2">
        {companies.map(c => {
          const on = c.id === active.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <span>{c.name}</span>
              {c.industry && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${on ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{c.industry}</span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${on ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>{c.banks.length}</span>
            </button>
          );
        })}
      </div>

      {/* Active company header + detail */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">{active.name}</h3>
        {active.status === 'Onboarding' && (
          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase animate-pulse">Onboarding</span>
        )}
      </div>
      <CompanyDetailCard company={active} alerts={alerts} onShowBankDetails={onShowBankDetails} />
    </div>
  );
};

// --- Appearance / Branding settings ---

const BrandingPage = ({
  branding,
  companies,
  onSaved,
  isAdmin,
  theme,
  onThemeChange,
}: {
  branding: { siteName: string; logo: string | null; theme: 'dark' | 'gray' | 'light'; logoBg: 'light' | 'dark' | 'none'; companyLogos: Record<string, string> };
  companies: Company[];
  onSaved: (b: { siteName: string; logo: string | null; theme: 'dark' | 'gray' | 'light'; logoBg: 'light' | 'dark' | 'none'; companyLogos: Record<string, string> }) => void;
  isAdmin: boolean;
  theme: 'dark' | 'gray' | 'light';           // the current user's personal theme
  onThemeChange: (t: 'dark' | 'gray' | 'light') => void; // persists per-user immediately
}) => {
  const [siteName, setSiteName] = useState(branding.siteName);
  const [logo, setLogo] = useState<string | null>(branding.logo);
  const [logoBg, setLogoBg] = useState<'light' | 'dark' | 'none'>(branding.logoBg);
  const [companyLogos, setCompanyLogos] = useState<Record<string, string>>(branding.companyLogos || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const companyFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCompanyFile = (id: string, file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 1_000_000) { setError('Image is too large (max 1MB). Try a smaller PNG/SVG.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setCompanyLogos(prev => ({ ...prev, [id]: reader.result as string })); setSaved(false); };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsDataURL(file);
  };

  const handleFile = (file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 1_000_000) { setError('Image is too large (max 1MB). Try a smaller PNG/SVG.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setLogo(reader.result as string); setSaved(false); };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ siteName: siteName.trim() || 'Liquidity Reports', logo, logoBg, companyLogos }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      const cleanLogos = Object.fromEntries(Object.entries(companyLogos).filter(([, v]) => v));
      const next = { siteName: siteName.trim() || 'Liquidity Reports', logo, theme: branding.theme, logoBg, companyLogos: cleanLogos };
      onSaved(next);
      setSaved(true);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Appearance</h2>
        <p className="text-sm text-slate-400">
          {isAdmin
            ? 'Your theme is saved to your account. The logo, name and company logos below apply to everyone in your organization.'
            : 'Choose the portal theme for your account. Your choice is saved to your profile.'}
        </p>
      </div>

      {/* Theme — a personal preference, saved per user */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Theme</label>
        <div className="grid grid-cols-3 gap-3 max-w-lg">
          {([
            { id: 'light', label: 'White', swatch: '#ffffff' },
            { id: 'gray', label: 'Gray', swatch: '#3f4654' },
            { id: 'dark', label: 'Dark', swatch: '#0b1220' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => onThemeChange(opt.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${theme === opt.id ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="w-9 h-9 rounded-lg shrink-0 ring-1 ring-black/10" style={{ background: opt.swatch }} />
              <span className="text-sm font-semibold text-slate-700">{opt.label}</span>
              {theme === opt.id && <Check size={15} className="text-indigo-600 ml-auto" />}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Applies to your view only and is remembered on your next sign-in.</p>
      </div>

      {isAdmin && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Logo */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Portal logo</label>
          <div className="flex items-center gap-5">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 p-2 ${logo && logoBg !== 'none' ? 'ring-1 ring-black/5' : ''}`} style={{ backgroundColor: logo ? logoBgColor(logoBg) : undefined }}>
              {logo
                ? <img src={logo} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                : <span className="w-full h-full rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl">{(siteName?.[0] || 'L').toUpperCase()}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                >
                  <UploadCloud size={15} /> Upload image
                </button>
                {logo && (
                  <button onClick={() => { setLogo(null); setSaved(false); }} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">PNG, SVG or JPG · transparent background recommended · max 1MB.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* Logo backdrop — pick what suits the logo (light-on-transparent vs dark-on-transparent) */}
          <div className="mt-4">
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Logo background</span>
            <div className="flex items-center gap-2">
              {([['light', 'White'], ['dark', 'Dark'], ['none', 'Transparent']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setLogoBg(id); setSaved(false); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${logoBg === id ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <span className="w-4 h-4 rounded ring-1 ring-black/10" style={id === 'none' ? { backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,#fff 25%,#fff 75%,#cbd5e1 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px' } : { backgroundColor: logoBgColor(id) }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Site name */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Site name</label>
          <input
            type="text"
            value={siteName}
            onChange={e => { setSiteName(e.target.value); setSaved(false); }}
            placeholder="Liquidity Reports"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
          />
        </div>

        {/* Per-company logos */}
        {companies.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Company logos</label>
            <div className="space-y-2">
              {companies.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 p-1 ring-1 ring-slate-200" style={{ backgroundColor: companyLogos[c.id] ? '#ffffff' : '#eef2ff' }}>
                    {companyLogos[c.id]
                      ? <img src={companyLogos[c.id]} alt={c.name} className="max-w-full max-h-full object-contain" />
                      : <span className="text-indigo-600 font-bold text-xs">{c.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <span className="text-sm font-medium text-slate-700 flex-1 truncate">{c.name}</span>
                  <button onClick={() => companyFileRefs.current[c.id]?.click()} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Upload</button>
                  {companyLogos[c.id] && (
                    <button onClick={() => { setCompanyLogos(prev => ({ ...prev, [c.id]: '' })); setSaved(false); }} className="text-xs font-semibold text-slate-400 hover:text-red-500">Remove</button>
                  )}
                  <input ref={el => { companyFileRefs.current[c.id] = el; }} type="file" accept="image/*" className="hidden" onChange={e => handleCompanyFile(c.id, e.target.files?.[0])} />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${saving ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved</span>}
        </div>
      </div>
      )}
    </div>
  );
};

// --- App Component ---

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.user) setAuthUser(data.user); })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUser(null);
  };

  // ── Company data ────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('smarttool_data');
    if (!saved) return [];
    try {
      const parsedSaved = JSON.parse(saved);
      const rawData = parsedSaved.dashboard_data || parsedSaved;
      return Array.isArray(rawData) ? rawData : [];
    } catch (e) {
      console.error("Failed to restore data:", e);
      return [];
    }
  });
  const companiesRef = useRef<Company[]>(companies);
  
  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  const [activePage, setActivePage] = useState<Page>('companies');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Historical date picker ────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [historyDate, setHistoryDate] = useState<string>('');      // '' = live
  const [historyData, setHistoryData] = useState<any[] | null>(null);
  const [historyEmpty, setHistoryEmpty] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const isHistoricalMode = historyDate !== '';

  const handleDateChange = async (date: string) => {
    if (!date) {
      // Reset to live
      setHistoryDate('');
      setHistoryData(null);
      setHistoryEmpty(false);
      return;
    }
    setHistoryDate(date);
    setHistoryEmpty(false);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/liquidity/snapshot?date=${date}`);
      const json = await res.json();
      if (json.empty || !json.data) {
        setHistoryData(null);
        setHistoryEmpty(true);
      } else {
        setHistoryData(json.data);
        setHistoryEmpty(false);
      }
    } catch {
      setHistoryEmpty(true);
    } finally {
      setHistoryLoading(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo(0, 0);
    }
  }, [selectedCompanyId, activePage]);
  const [lastSynced, setLastSynced] = useState<string>(() => {
    return localStorage.getItem('smarttool_last_sync') || 
      new Date().toLocaleTimeString('en-GB', { 
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
  });

  // User Management State — loaded from DB
  const [users, setUsers] = useState<User[]>([]);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  };

  // Roles (custom roles + per-role company/bank access) — managed in User Management → Roles.
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const loadRoles = async () => {
    try {
      const res = await fetch('/api/roles', { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setRoles(data.roles || []); }
    } catch (e) { console.error('Failed to load roles:', e); }
  };

  useEffect(() => {
    if (authUser?.role === 'Admin') { loadUsers(); loadRoles(); }
  }, [authUser]);

  const handleCreateRole = async (name: string): Promise<void> => {
    const res = await fetch('/api/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create role'); }
    await loadRoles();
  };
  const handleUpdateRole = async (role: RoleDef): Promise<void> => {
    const res = await fetch(`/api/roles/${role.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: role.name, permissions: role.permissions, pages: role.pages }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to update role'); }
    await loadRoles();
  };
  const handleDeleteRole = async (id: string): Promise<void> => {
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to delete role'); }
    await loadRoles();
  };

  const [alerts, setAlerts] = useState<WalletAlert[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<{ date: string; fiat: number; crypto: number; total: number; }[]>([]);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [selectedBankDetails, setSelectedBankDetails] = useState<Bank | null>(null);
  const [isBankDetailsModalOpen, setIsBankDetailsModalOpen] = useState(false);

  // Org branding (logo + site name + theme) — configured in Settings → Appearance.
  const [branding, setBranding] = useState<{ siteName: string; logo: string | null; theme: 'dark' | 'gray' | 'light'; logoBg: 'light' | 'dark' | 'none'; companyLogos: Record<string, string> }>({ siteName: 'Liquidity Reports', logo: null, theme: 'dark', logoBg: 'light', companyLogos: {} });
  useEffect(() => {
    fetch('/api/branding', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(b => { if (b && b.siteName) setBranding({ siteName: b.siteName, logo: b.logo || null, theme: ['gray', 'light', 'dark'].includes(b.theme) ? b.theme : 'dark', logoBg: ['light', 'dark', 'none'].includes(b.logoBg) ? b.logoBg : 'light', companyLogos: b.companyLogos || {} }); })
      .catch(() => {});
  }, []);
  useEffect(() => { document.title = branding.siteName || 'Liquidity Reports'; }, [branding.siteName]);

  // Theme is a per-user preference (Settings → Appearance), stored server-side
  // per account. null until loaded; falls back to the org default (branding.theme).
  const [userTheme, setUserTheme] = useState<'dark' | 'gray' | 'light' | null>(null);
  useEffect(() => {
    fetch('/api/my-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && ['dark', 'gray', 'light'].includes(d.theme)) setUserTheme(d.theme); })
      .catch(() => {});
  }, []);
  const effectiveTheme: 'dark' | 'gray' | 'light' = userTheme ?? branding.theme;
  const handleThemeChange = (t: 'dark' | 'gray' | 'light') => {
    setUserTheme(t); // apply immediately
    fetch('/api/my-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  };

  // Apply the chosen theme: data-theme drives the portal-wide CSS (see index.css),
  // and we tint the sidebar variables so the rail matches the surface palette.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = effectiveTheme;
    const palettes = {
      dark: { bg: '#0f172a', border: '#1e293b' },
      gray: { bg: '#2b333f', border: '#3c4655' },
      light: { bg: '#1e293b', border: '#334155' }, // original dark sidebar over a bright portal
    };
    const p = palettes[effectiveTheme] || palettes.dark;
    root.style.setProperty('--color-sidebar-bg', p.bg);
    root.style.setProperty('--color-sidebar-border', p.border);
  }, [effectiveTheme]);

  const handleShowBankDetails = (bank: Bank) => {
    setSelectedBankDetails(bank);
    setIsBankDetailsModalOpen(true);
  };

  // Export the current Companies view to Excel — one worksheet per on-screen table.
  const handleExportCompaniesCsv = () => {
    const flat: (string | number)[][] = [];
    const detail: (string | number)[][] = [];
    const byBank: Record<string, number> = {};
    const byCompany: Record<string, number> = {};
    const byCurrency: Record<string, number> = {};
    filteredCompanies.forEach(company => {
      (company.banks || []).forEach((bank: any) => {
        const isVerified = bank.is_verified !== undefined
          ? (bank.is_verified === 1 || bank.is_verified === '1' || bank.is_verified === true)
          : bank.isVerified === true;
        if (!isVerified) return;
        const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
        const cellMap: Record<string, { balance: number; usd: number }> = {};
        accounts.forEach((acc: any) => {
          let wallets = acc.wallets || [];
          if (typeof wallets === 'string') { try { wallets = JSON.parse(wallets); } catch { wallets = []; } }
          (wallets as any[]).forEach(w => {
            const cur = w.currency || '?';
            if (!cellMap[cur]) cellMap[cur] = { balance: 0, usd: 0 };
            cellMap[cur].balance += Number(w.balance) || 0;
            cellMap[cur].usd += Number(w.value_usd) || 0;
            // Per-account/wallet row (matches the per-company bank detail section)
            detail.push([
              company.name, bank.name, acc.account_number || acc.accountNumber || '',
              cur, Number(w.balance) || 0, Math.round(Number(w.value_usd) || 0),
              bank.last_modified_date || '',
            ]);
          });
        });
        Object.entries(cellMap).forEach(([currency, cell]) => {
          const fx = cell.balance !== 0 ? cell.usd / cell.balance : 0;
          flat.push([company.name, bank.name, currency, Math.round(cell.balance), fx ? fx.toFixed(4) : '', Math.round(cell.usd)]);
          byBank[bank.name] = (byBank[bank.name] || 0) + cell.usd;
          byCompany[company.name] = (byCompany[company.name] || 0) + cell.usd;
          byCurrency[currency] = (byCurrency[currency] || 0) + cell.usd;
        });
      });
    });
    const toRows = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => [k, Math.round(v)]);
    const who = selectedCompanyId ? (companies.find(c => c.id === selectedCompanyId)?.name || 'company') : 'all-companies';
    downloadExcel(`portfolio-${who}.xls`, [
      { name: 'Portfolio Summary', headers: ['Company', 'Bank', 'Currency', 'Balance', 'FX Rate', 'USD Value'], rows: flat },
      { name: 'Bank Detail', headers: ['Company', 'Bank', 'Account', 'Currency', 'Balance (LCY)', 'USD Value', 'Last Sync'], rows: detail },
      { name: 'By Bank', headers: ['Bank', 'USD Value'], rows: toRows(byBank) },
      { name: 'By Company', headers: ['Company', 'USD Value'], rows: toRows(byCompany) },
      { name: 'By Currency', headers: ['Currency', 'USD Value'], rows: toRows(byCurrency) },
    ]);
  };

  // Users are now stored in DB — no localStorage sync needed

  // Load alerts from DB on mount
  useEffect(() => {
    fetch('/api/alerts')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Load portfolio history for sparklines (last 7 days)
  useEffect(() => {
    if (!authUser) return;
    const url = selectedCompanyId && selectedCompanyId !== 'all'
      ? `/api/portfolio-history?days=7&companyId=${selectedCompanyId}`
      : '/api/portfolio-history?days=7';
    fetch(url)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(res => setPortfolioHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [authUser, selectedCompanyId]);

  const handleAddUser = () => {
    setEditingUser(null);
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const handleDeleteUser = async (userId: string) => {
    // Prevent self-deletion
    if (userId === authUser?.id) {
      console.warn('Cannot delete your own account.');
      return;
    }
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (res.ok) await loadUsers();
    } catch (e) {
      console.error('Failed to delete user:', e);
    }
  };

  const handleSaveUser = async (user: User): Promise<void> => {
    const isEdit = !!editingUser;
    const res = await fetch(
      isEdit ? `/api/users/${user.id}` : '/api/users',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }
    await loadUsers();
    setIsUserModalOpen(false);
  };

  // Direct update (used by the inline permissions matrix) — PUT without touching the modal.
  const handleUpdateUser = async (user: User): Promise<void> => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }
    await loadUsers();
  };

  const handleAddAlert = async (newAlert: Partial<WalletAlert>) => {
    const alertId = `alt-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    const alert: WalletAlert = { ...newAlert, id: alertId } as WalletAlert;
    try {
      await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert) });
      setAlerts(prev => [...prev, alert]);
      // Trigger immediate server-side check
      fetch('/api/alerts/check', { method: 'POST' }).catch(() => {});
    } catch (e) { console.error('Failed to save alert:', e); }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e) { console.error('Failed to delete alert:', e); }
  };

  const handleToggleAlert = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/${id}/toggle`, { method: 'PUT' });
      const data = await res.json();
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isEnabled: data.isEnabled } : a));
    } catch (e) { console.error('Failed to toggle alert:', e); }
  };

  const filteredCompanies = useMemo(() => {
    // Use historical snapshot data when in history mode, otherwise live data
    let result = (isHistoricalMode && historyData) ? historyData : companies;
    
    // Primary Filter: Sidebar selection
    if (selectedCompanyId) {
      result = result.filter(c => c.id === selectedCompanyId);
    }

    // Secondary Filter: Search query (Company name, Bank name, Account number)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.map(company => {
        const companyMatches = company.name.toLowerCase().includes(q);
        
        const filteredBanks = company.banks.filter(bank => {
          const bankMatches = bank.name.toLowerCase().includes(q);
          const accountMatches = (bank.accounts || []).some(acc => acc.accountNumber && acc.accountNumber.toLowerCase().includes(q));
          return bankMatches || accountMatches;
        });

        // If company name matches, show all its banks (or filtered ones if provided)
        if (companyMatches) return company;
        
        // If some banks matched, show company with only those banks
        if (filteredBanks.length > 0) {
          return { ...company, banks: filteredBanks };
        }
        
        return null;
      }).filter(Boolean) as Company[];
    }

    return result;
  }, [selectedCompanyId, companies, searchQuery, historyData, isHistoricalMode]);

  const filteredBanks = useMemo(() => {
    return filteredCompanies.flatMap(c => c.banks);
  }, [filteredCompanies]);

  const selectedCompanyName = useMemo(() => {
    if (activePage === 'dashboard') return 'My Dashboard';
    if (activePage === 'psp') return 'Payment Providers';
    if (activePage === 'users') return 'User Management';
    if (activePage === 'alerts') return 'Alert Configuration';
    if (activePage === 'upload') return 'Manual Data Upload';
    if (activePage === 'branding') return 'Appearance';
    if (activePage === 'diagnostics') return 'Diagnostics';
    if (!selectedCompanyId) return 'Liquidity Overview';
    return companies.find(c => c.id === selectedCompanyId)?.name || 'Companies';
  }, [selectedCompanyId, activePage, companies]);

  useEffect(() => {
    // Initial fetch from server
    const init = async () => {
      try {
        const res = await fetch('/api/liquidity');
        const raw = await res.json();

        let data = null;
        let serverUpdate = 0;
        if (raw && raw.data) {
          data = raw.data;
          serverUpdate = raw.lastUpdateTime || 0;
        } else {
          data = raw.dashboard_data || (Array.isArray(raw) ? raw : null);
        }

        if (data && Array.isArray(data) && data.length > 0) {
          setCompanies(data);
          localStorage.setItem('smarttool_data', JSON.stringify(data));
          if (serverUpdate > 0) {
            const syncTime = new Date(serverUpdate).toLocaleTimeString('en-GB', {
              timeZone: 'Asia/Jerusalem',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
            setLastSynced(syncTime);
            localStorage.setItem('smarttool_last_sync', syncTime);
          }
        }
      } catch (err) {
        console.error('Initial setup failed:', err);
      }
      
      // Hidden helper for the user to inject data manually for testing
      (window as any).importSmartToolData = (json: any) => {
        try {
          const data = typeof json === 'string' ? JSON.parse(json) : json;
          if (Array.isArray(data)) {
            setCompanies(data);
            localStorage.setItem('smarttool_data', JSON.stringify(data));
            console.log('✅ Data imported successfully!');
            return 'Success';
          }
          throw new Error('Data must be an array of companies');
        } catch (e) {
          console.error('❌ Manual import failed:', e);
          return 'Failed: ' + (e as Error).message;
        }
      };
    };
    
    init();

    // Background polling every 3 seconds to catch external updates (e.g. from Postman)
    const pollInterval = setInterval(async () => {
      if (isRefreshing) return; // Don't background poll if we're in a manual refresh loop
      
      try {
        const res = await fetch('/api/liquidity');
        const raw = await res.json();
        
        const data = raw.data || raw.dashboard_data || (Array.isArray(raw) ? raw : null);
        const serverUpdate = raw.lastUpdateTime || 0;

        if (data && Array.isArray(data) && data.length > 0) {
          // Only update if it's actually different to avoid flicker
          const currentDataStr = JSON.stringify(companiesRef.current);
          const newDataStr = JSON.stringify(data);
          
          if (newDataStr !== currentDataStr) {
            console.log('%c [Poll] External data update detected!', 'color: #3b82f6; font-weight: bold;');
            setCompanies(data);
            localStorage.setItem('smarttool_data', newDataStr);
            
            const syncTime = new Date(serverUpdate).toLocaleTimeString('en-GB', { 
              timeZone: 'Asia/Jerusalem',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
            setLastSynced(syncTime);
            localStorage.setItem('smarttool_last_sync', syncTime);
          }
        }
      } catch (err) {
        // Silently fail background poll
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Trigger a fresh DB query on the server
      await fetch('/api/sync', { method: 'POST' });

      // Fetch the updated data
      const res = await fetch('/api/liquidity');
      const result = await res.json();
      const data = result.data || result.dashboard_data || (Array.isArray(result) ? result : null);
      const lastUpdate = result.lastUpdateTime || 0;

      if (data && Array.isArray(data) && data.length > 0) {
        console.log('%c [Sync] Data refreshed from DB.', 'color: #22c55e; font-weight: bold;');
        setCompanies(data);
        localStorage.setItem('smarttool_data', JSON.stringify(data));

        const syncTime = new Date(lastUpdate).toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Jerusalem',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        setLastSynced(syncTime);
        localStorage.setItem('smarttool_last_sync', syncTime);
      } else {
        console.warn('Sync complete — no data returned (DB may be empty or unreachable).');

        // Still update the in-memory view with whatever we got
        const fallbackRes = await fetch('/api/liquidity');
        const fallbackResult = await fallbackRes.json();
        const fallbackData = fallbackResult.data || fallbackResult.dashboard_data || (Array.isArray(fallbackResult) ? fallbackResult : null);
        const fallbackUpdate = fallbackResult.lastUpdateTime || 0;

        if (fallbackData && fallbackData.length > 0) {
          setCompanies(fallbackData);
          const syncTime = new Date(fallbackUpdate).toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Jerusalem',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          });
          setLastSynced(syncTime);
          localStorage.setItem('smarttool_last_sync', syncTime);
        }
      }
    } catch (error) {
      console.error('Failed to trigger Sync:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Trigger a full DB sync the moment the user logs in (or on page reload while
  // already authenticated). This mirrors the manual Sync button behaviour so the
  // dashboard always shows live DB data immediately after login, not stale cache.
  useEffect(() => {
    if (authUser) handleRefresh();
  }, [authUser]);

  const stats = useMemo(() => {
    return {
      nodes: filteredBanks.length
    };
  }, [filteredBanks]);

  const hasAnyWallets = (c: Company) => (c.banks || []).some(b => (b.accounts || []).some(acc => (acc.wallets || []).length > 0));

  // Mobile sidebar open/close state — must be declared before any early returns
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onLogin={(user) => setAuthUser(user)} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden selection:bg-indigo-600/10 selection:text-indigo-600 font-sans">
      <Sidebar
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        onSelectCompany={setSelectedCompanyId}
        activePage={activePage}
        onNavigate={setActivePage}
        authUser={authUser}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        brandName={branding.siteName}
        brandLogo={branding.logo}
        brandLogoBg={branding.logoBg}
        companyLogos={branding.companyLogos}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <Header
          title={selectedCompanyName}
          searchTerm={searchQuery}
          onSearch={setSearchQuery}
          onMenuClick={() => setSidebarOpen(true)}
          logo={activePage === 'companies' && selectedCompanyId ? (branding.companyLogos[selectedCompanyId] || null) : null}
        />

        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activePage === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <WidgetCanvas companies={companies} history={portfolioHistory} />
              </motion.div>
            )}

            {activePage === 'companies' && (
              <motion.div
                key="companies"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-[2000px] mx-auto p-4 md:p-8 space-y-6 md:space-y-8"
              >
                <div className="space-y-6">

                  {/* Top toolbar — date · last sync · sync · export */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                        <input
                          type="date"
                          max={todayStr}
                          value={historyDate || todayStr}
                          onChange={e => { const val = e.target.value; if (val === todayStr) handleDateChange(''); else handleDateChange(val); }}
                          className="text-xs font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
                        />
                      </div>
                      {!isHistoricalMode && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Global Sync</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-mono font-bold text-slate-700">{lastSynced}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isHistoricalMode && (
                        <button
                          onClick={handleRefresh}
                          disabled={isRefreshing}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isRefreshing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                          <Globe size={14} className={isRefreshing ? 'animate-spin' : ''} />
                          {isRefreshing ? 'Syncing…' : 'Sync All'}
                        </button>
                      )}
                      <button
                        onClick={handleExportCompaniesCsv}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Download size={15} /> Export Excel
                      </button>
                    </div>
                  </div>

                  {/* Historical mode banner */}
                  {isHistoricalMode && !historyLoading && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                      <div className="flex items-center gap-3">
                        <History size={16} className="text-amber-500 shrink-0" />
                        <p className="text-sm font-bold text-amber-800">
                          Viewing historical snapshot —&nbsp;
                          {new Date(historyDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        {historyEmpty && (
                          <span className="text-sm text-amber-700">· No data available for this date</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDateChange('')}
                        className="text-xs font-bold text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
                      >
                        ← Back to Live
                      </button>
                    </div>
                  )}

                  {/* ── Asset Breakdown header card ──────────────────── */}
                  {(() => {
                    const CRYPTO_CURRENCIES = new Set(['BTC','ETH','USDT','USDtb','USDC','TUSD','BUSD','DAI','PEPE','HEX','SOL','BNB','XRP','LTC','MATIC','ADA','AVAX','DOT']);
                    let cryptoTotal = 0;
                    let fiatTotal = 0;
                    filteredCompanies.forEach(company => {
                      (company.banks || []).forEach(bank => {
                        const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
                        accounts.forEach((acc: any) => {
                          let wallets = acc.wallets || [];
                          if (typeof wallets === 'string') try { wallets = JSON.parse(wallets); } catch { wallets = []; }
                          (wallets as any[]).forEach((w: any) => {
                            const usd = Number(w.value_usd) || 0;
                            if (CRYPTO_CURRENCIES.has(w.currency)) cryptoTotal += usd;
                            else fiatTotal += usd;
                          });
                        });
                      });
                    });
                    const grandTotalUsd = cryptoTotal + fiatTotal;
                    const fmtUsdHdr = (n: number) => {
                      const neg = n < 0;
                      return (neg ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    };

                    // ── Donut chart helpers ──
                    const cx = 100, cy = 100, r = 76, sw = 18;
                    const circ = 2 * Math.PI * r;
                    const absTotal = Math.abs(cryptoTotal) + Math.abs(fiatTotal) || 1;
                    const cryptoRatio = Math.abs(cryptoTotal) / absTotal;
                    const fiatRatio   = Math.abs(fiatTotal)   / absTotal;
                    const cryptoPct   = Math.round(cryptoRatio * 100);
                    const fiatPct     = 100 - cryptoPct;

                    // ── Sparkline data (real history or fallback) ──
                    const hasHistory = portfolioHistory.length >= 2;
                    const SPARK_FIAT:   SparkPoint[] = hasHistory ? portfolioHistory.map(d => ({ date: d.date, value: d.fiat }))   : [];
                    const SPARK_CRYPTO: SparkPoint[] = hasHistory ? portfolioHistory.map(d => ({ date: d.date, value: d.crypto })) : [];
                    const SPARK_TOTAL:  SparkPoint[] = hasHistory ? portfolioHistory.map(d => ({ date: d.date, value: d.total }))  : [];

                    return (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* ── Main body ── */}
                    <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                      {/* ① LEFT — icon + donut + legend */}
                      <div className="flex flex-col items-center lg:items-start gap-4 p-5 lg:p-6 lg:w-[38%]">
                        {/* Title row */}
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0 ${isHistoricalMode ? 'bg-amber-500 shadow-amber-500/20' : 'bg-indigo-600 shadow-indigo-600/20'}`}>
                            {historyLoading ? <RefreshCcw size={18} className="animate-spin" /> : <LayoutDashboard size={18} />}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900 leading-tight">Asset Breakdown</h3>
                            <p className="text-[11px] text-slate-400 font-medium">
                              {isHistoricalMode ? 'Historical — read only' : 'Aggregated across all accounts'}
                            </p>
                          </div>
                        </div>

                        {/* Donut chart — bigger */}
                        <svg width={200} height={200} viewBox="0 0 200 200" className="mx-auto">
                          <g transform={`rotate(-90 ${cx} ${cy})`}>
                            {/* track */}
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
                            {/* crypto arc — indigo */}
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={sw}
                              strokeDasharray={`${cryptoRatio * circ} ${circ}`} />
                            {/* fiat arc — sky blue */}
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#93c5fd" strokeWidth={sw}
                              strokeDasharray={`${fiatRatio * circ} ${circ}`}
                              strokeDashoffset={`${-cryptoRatio * circ}`} />
                          </g>
                          <text x={cx} y={cy - 14} textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8" letterSpacing="0.8">TOTAL PORTFOLIO</text>
                          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="#1e293b">{fmtUsdHdr(grandTotalUsd)}</text>
                        </svg>

                        {/* Legend */}
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Crypto</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold font-mono text-slate-800">{fmtUsdHdr(cryptoTotal)}</span>
                              <span className="text-[10px] text-indigo-400 font-bold ml-1.5">{cryptoPct}%</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-300 shrink-0" />
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Fiat</span>
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-bold font-mono ${fiatTotal < 0 ? 'text-red-500' : 'text-slate-800'}`}>{fmtUsdHdr(fiatTotal)}</span>
                              <span className="text-[10px] text-sky-400 font-bold ml-1.5">{fiatPct}%</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ② RIGHT — mini cards + total card */}
                      <div className="flex flex-col gap-3 p-5 lg:p-6 flex-1">

                        {/* Top row: Fiat + Crypto mini cards */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Fiat mini card */}
                          <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                                <WalletIcon size={14} className="text-indigo-600" />
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fiat (USD)</p>
                            </div>
                            <p className={`text-xl font-bold font-mono leading-none ${fiatTotal < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                              {fmtUsdHdr(fiatTotal)}
                            </p>
                            <SparklineChart data={SPARK_FIAT} color="#6366f1" gradId="gradFiat" height={36} fmtVal={fmtUsdHdr} />
                          </div>

                          {/* Crypto mini card */}
                          <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                                <Bitcoin size={14} className="text-sky-500" />
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Crypto (USD)</p>
                            </div>
                            <p className={`text-xl font-bold font-mono leading-none ${cryptoTotal < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                              {fmtUsdHdr(cryptoTotal)}
                            </p>
                            <SparklineChart data={SPARK_CRYPTO} color="#38bdf8" gradId="gradCrypto" height={36} fmtVal={fmtUsdHdr} />
                          </div>
                        </div>

                        {/* Total portfolio dark card */}
                        <div className="relative bg-[#1a1a2e] rounded-xl p-4 overflow-hidden flex-1 min-h-[110px]">
                          <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Total Portfolio (USD)</p>
                          <p className={`text-3xl font-bold font-mono text-white leading-none mb-1 ${grandTotalUsd < 0 ? 'text-red-400' : 'text-white'}`}>
                            {fmtUsdHdr(grandTotalUsd)}
                          </p>
                          {/* Area chart overlay */}
                          <div className="absolute bottom-0 left-0 right-0 h-16">
                            <SparklineChart data={SPARK_TOTAL} color="#a5b4fc" gradId="gradTotal" height={64} dark fmtVal={fmtUsdHdr} />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                    ); // end IIFE return
                  })(/* Asset Breakdown card */)}

                  {/* ── Portfolio Summary (flat + 3 mini tables) ─────── */}
                  {!historyEmpty && filteredCompanies.length > 0 && (() => {
                    // ── helpers ──────────────────────────────────────────
                    const fmtN = (n: number) => {
                      const neg = n < 0;
                      const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                      return neg ? `(${s})` : s;
                    };
                    const fmtUsd = (n: number) => {
                      const neg = n < 0; const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                      return (neg ? '-$' : '$') + s;
                    };
                    const usdCls = (n: number) => n < 0 ? 'text-red-600' : 'text-slate-800';

                    // ── build flat rows ───────────────────────────────────
                    type FlatRow = { company: string; bank: string; currency: string; balance: number; fxRate: number; usdValue: number; };
                    const rows: FlatRow[] = [];
                    // accumulators for mini tables
                    const byBank: Record<string, number> = {};
                    const byCompany: Record<string, number> = {};
                    const byCurrency: Record<string, number> = {};

                    filteredCompanies.forEach(company => {
                      (company.banks || []).forEach(bank => {
                        const isVerified = bank.is_verified !== undefined
                          ? (bank.is_verified === 1 || bank.is_verified === "1" || bank.is_verified === true)
                          : bank.isVerified === true;
                        if (!isVerified) return;
                        const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
                        // Aggregate per company+bank+currency so we get one row per triple
                        const cellMap: Record<string, { balance: number; usd: number }> = {};
                        accounts.forEach((acc: any) => {
                          let wallets = acc.wallets || [];
                          if (typeof wallets === 'string') try { wallets = JSON.parse(wallets); } catch { wallets = []; }
                          (wallets as any[]).forEach((w: any) => {
                            const cur = w.currency || '?';
                            if (!cellMap[cur]) cellMap[cur] = { balance: 0, usd: 0 };
                            cellMap[cur].balance += Number(w.balance) || 0;
                            cellMap[cur].usd += Number(w.value_usd) || 0;
                          });
                        });
                        Object.entries(cellMap).forEach(([currency, cell]) => {
                          const fxRate = cell.balance !== 0 ? cell.usd / cell.balance : 0;
                          rows.push({ company: company.name, bank: bank.name, currency, balance: cell.balance, fxRate, usdValue: cell.usd });
                          byBank[bank.name] = (byBank[bank.name] || 0) + cell.usd;
                          byCompany[company.name] = (byCompany[company.name] || 0) + cell.usd;
                          byCurrency[currency] = (byCurrency[currency] || 0) + cell.usd;
                        });
                      });
                    });

                    const grandTotal = rows.reduce((s, r) => s + r.usdValue, 0);
                    const currencyBadge = (c: string) =>
                      c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
                      c === 'BTC' || c === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

                    const MiniTable = ({ title, data }: { title: string; data: Record<string, number> }) => {
                      const total = Object.values(data).reduce((s, v) => s + v, 0);
                      return (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-w-[180px]">
                          <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(data).map(([label, usd]) => (
                                <tr key={label} className="border-b border-slate-50 hover:bg-slate-50/50">
                                  <td className="px-4 py-2.5 text-slate-600 font-medium">{label}</td>
                                  <td className={`px-4 py-2.5 text-right font-mono font-bold ${usdCls(usd)}`}>{fmtUsd(usd)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-indigo-50 border-t border-indigo-100">
                                <td className="px-4 py-2.5 font-bold text-indigo-700 uppercase text-[10px] tracking-widest">Total</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-bold text-sm ${usdCls(total)}`}>{fmtUsd(total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-4">
                        {/* Three mini summary tables */}
                        <div className="flex gap-4 flex-wrap">
                          <MiniTable title="By Bank" data={byBank} />
                          <MiniTable title="By Company" data={byCompany} />
                          <MiniTable title="By Currency" data={byCurrency} />
                        </div>

                        {/* Main flat table */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                            <WalletIcon size={16} className="text-indigo-500" />
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Portfolio Summary</h3>
                            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{selectedCompanyId ? (companies.find(c => c.id === selectedCompanyId)?.name || 'Company') : 'All Companies'}</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                              <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <tr>
                                  <th className="px-5 py-3 border-b border-slate-100">Company</th>
                                  <th className="px-5 py-3 border-b border-slate-100">Bank</th>
                                  <th className="px-5 py-3 border-b border-slate-100">Currency</th>
                                  <th className="px-5 py-3 border-b border-slate-100 text-right">Balance</th>
                                  <th className="px-5 py-3 border-b border-slate-100 text-right">FX Rate</th>
                                  <th className="px-5 py-3 border-b border-slate-100 text-right">USD Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3 font-medium text-slate-700">{row.company}</td>
                                    <td className="px-5 py-3 text-slate-600">{row.bank}</td>
                                    <td className="px-5 py-3">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${currencyBadge(row.currency)}`}>{row.currency}</span>
                                    </td>
                                    <td className={`px-5 py-3 text-right font-mono ${row.balance < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                      {CURRENCY_SYMBOLS[row.currency] || ''}{fmtN(row.balance)}
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono text-slate-500">
                                      {row.fxRate !== 0 ? row.fxRate.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 }) : '—'}
                                    </td>
                                    <td className={`px-5 py-3 text-right font-mono font-bold ${usdCls(row.usdValue)}`}>
                                      {fmtUsd(row.usdValue)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-indigo-50 border-t-2 border-indigo-100">
                                  <td colSpan={5} className="px-5 py-3 font-bold text-indigo-700 uppercase text-[11px] tracking-widest">Total</td>
                                  <td className={`px-5 py-3 text-right font-mono font-bold text-sm ${usdCls(grandTotal)}`}>{fmtUsd(grandTotal)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-8">
                    {historyEmpty ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-12 text-center">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
                          <History size={24} className="text-amber-400" />
                        </div>
                        <h4 className="text-slate-900 font-bold text-lg">No Historical Data</h4>
                        <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">
                          Sorry, we don't have historical data for this date. Try a different date or go back to live data.
                        </p>
                        <button
                          onClick={() => handleDateChange('')}
                          className="mt-6 px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all flex items-center gap-2 mx-auto"
                        >
                          <History size={16} />
                          Back to Live Data
                        </button>
                      </div>
                    ) : filteredCompanies.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <LayoutDashboard size={24} className="text-slate-300" />
                        </div>
                        <h4 className="text-slate-900 font-bold text-lg">No Account Data Found</h4>
                        <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">
                          Please run the sync or feed data from your database to see the liquidity breakdown.
                        </p>
                        <button
                          onClick={handleRefresh}
                          className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-2 mx-auto"
                        >
                          <RefreshCcw size={16} />
                          Trigger Initial Sync
                        </button>
                      </div>
                    ) : (
                      <CompanyTabs companies={filteredCompanies} alerts={alerts} onShowBankDetails={handleShowBankDetails} />
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activePage === 'psp' && (
              <motion.div
                key="psp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-[2000px] mx-auto p-4 md:p-8"
              >
                <PSPPage companies={companies} onSync={handleRefresh} isSyncing={isRefreshing} />
              </motion.div>
            )}

            {activePage === 'diagnostics' && authUser?.role === 'Admin' && (
              <motion.div
                key="diagnostics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-[1100px] mx-auto p-4 md:p-8 space-y-5"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-emerald-400"><Terminal size={18} /></div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Technical Diagnostics</h2>
                      <p className="text-xs text-slate-400">Live view of data payload, state and cache.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { localStorage.removeItem('smarttool_data'); window.location.reload(); }}
                    className="px-3 py-2 bg-red-500/10 text-red-600 text-xs font-bold uppercase rounded-lg border border-red-200 hover:bg-red-500/20 transition-all"
                  >
                    Hard Reset state
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[11px]">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <p className="text-slate-500 uppercase font-bold text-[9px] mb-2 tracking-widest">Active State</p>
                    <div className="space-y-1">
                      <p className="text-emerald-400">• Total Companies: {companies.length}</p>
                      <p className="text-emerald-400">• Current View: {selectedCompanyId || 'ALL'}</p>
                      <p className="text-emerald-400">• Last Global Sync: {lastSynced}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <p className="text-slate-500 uppercase font-bold text-[9px] mb-2 tracking-widest">Persistence</p>
                    <div className="space-y-1">
                      <p className="text-indigo-400">• LocalCache: {localStorage.getItem('smarttool_data') ? 'PRESENT' : 'EMPTY'}</p>
                      <p className="text-indigo-400">• Cache Size: {(localStorage.getItem('smarttool_data')?.length || 0).toLocaleString()} bytes</p>
                      <p className="text-indigo-400 mt-2 break-all">• API Endpoint: {window.location.origin}/api/update-data</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  <p className="text-slate-500 uppercase font-bold text-[9px] mb-4 tracking-widest">Raw Company JSON</p>
                  <pre className="text-emerald-500 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-auto">{JSON.stringify(companies, null, 2)}</pre>
                </div>
              </motion.div>
            )}

            {activePage === 'users' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <UserManagementPage
                  users={users}
                  onAddUser={handleAddUser}
                  onEditUser={handleEditUser}
                  onDeleteUser={handleDeleteUser}
                  companies={companies}
                  currentUserId={authUser?.id}
                  roles={roles}
                  onCreateRole={handleCreateRole}
                  onUpdateRole={handleUpdateRole}
                  onDeleteRole={handleDeleteRole}
                />
              </motion.div>
            )}

            {activePage === 'alerts' && (
              <motion.div
                key="alerts"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <AlertsPage
                  companies={companies}
                  alerts={alerts}
                  onAddAlert={handleAddAlert}
                  onDeleteAlert={handleDeleteAlert}
                  onToggleAlert={handleToggleAlert}
                />
              </motion.div>
            )}

            {activePage === 'upload' && (authUser?.role === 'Admin' || authUser?.role === 'Manager') && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <UploadScreen />
              </motion.div>
            )}

            {activePage === 'branding' && (
              <motion.div
                key="branding"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <BrandingPage
                  branding={branding}
                  companies={companies}
                  onSaved={setBranding}
                  isAdmin={authUser?.role === 'Admin'}
                  theme={effectiveTheme}
                  onThemeChange={handleThemeChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <UserModal 
          user={editingUser}
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          onSave={handleSaveUser}
          companies={companies}
          roles={roles}
        />

        <BankDetailsModal 
          bank={selectedBankDetails}
          isOpen={isBankDetailsModalOpen}
          onClose={() => setIsBankDetailsModalOpen(false)}
          alerts={alerts}
        />
      </div>
    </div>
  );
}
