import {
  Building2,
  LayoutDashboard,
  History,
  Settings,
  ShieldCheck,
  Search,
  Bell,
  ChevronRight,
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
  CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, Fragment, useRef, MouseEvent } from 'react';
import { MOCK_COMPANIES } from './mockData';
import { CURRENCY_SYMBOLS, Company, Bank, BankAccount, User, UserRole, WalletAlert, ExchangeRate } from './types';
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
type Page = 'dashboard' | 'psp' | 'users' | 'alerts' | 'upload';

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
}) => {
  // Filter nav items by role
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['Admin', 'Manager', 'Viewer'] },
    { id: 'psp', icon: CreditCard, label: 'Payment Providers', roles: ['Admin', 'Manager', 'Viewer'] },
    { id: 'users', icon: Users, label: 'User Management', roles: ['Admin'] },
    { id: 'alerts', icon: BellRing, label: 'Alert Center', roles: ['Admin', 'Manager'] },
    { id: 'upload', icon: Upload, label: 'Manual Data Upload', roles: ['Admin', 'Manager'] },
  ].filter(item => !authUser || item.roles.includes(authUser.role));
  const sidebarContent = (
    <div className="w-64 h-full bg-sidebar-bg text-white flex flex-col">
      <div className="p-6 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            L
          </div>
          <span className="text-xl font-bold tracking-tight">Liquidity</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Companies</div>

        <button
          onClick={() => {
            onSelectCompany(null);
            onNavigate('dashboard');
            onClose();
          }}
          className={`w-full flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer group ${
            selectedCompanyId === null && activePage === 'dashboard'
              ? 'bg-indigo-600 shadow-lg shadow-indigo-900/20'
              : 'hover:bg-slate-700/50 text-slate-300'
          }`}
        >
          <span className="text-sm font-medium">View All Companies</span>
          <span className={`text-[10px] px-2 py-0.5 rounded ${selectedCompanyId === null && activePage === 'dashboard' ? 'bg-indigo-400/30' : 'bg-slate-700 text-slate-400'}`}>ALL</span>
        </button>

        {companies.map((company) => (
          <button
            key={company.id}
            onClick={() => {
              onSelectCompany(company.id);
              onNavigate('dashboard');
              onClose();
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer group ${
              selectedCompanyId === company.id && activePage === 'dashboard'
                ? 'bg-indigo-600 shadow-lg shadow-indigo-900/20'
                : 'hover:bg-slate-700/50 text-slate-300'
            }`}
          >
            <span className="text-sm font-medium truncate pr-2">{company.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${selectedCompanyId === company.id && activePage === 'dashboard' ? 'bg-indigo-400/30' : 'bg-slate-700 text-slate-400'}`}>
              {company.banks.length}
            </span>
          </button>
        ))}

        <div className="pt-6">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">System</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id as Page); onClose(); }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                activePage === item.id
                  ? 'bg-slate-700/50 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <item.icon size={16} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="p-4 mt-auto border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold ring-1 ring-slate-500 shrink-0">
            {authUser?.name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="text-xs truncate flex-1 min-w-0">
            <div className="font-medium text-slate-200 truncate">{authUser?.name || 'Unknown'}</div>
            <div className="text-slate-500 truncate">{authUser?.role}</div>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded shrink-0"
          >
            <Lock size={14} />
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
  companies 
}: { 
  user?: User | null,
  isOpen: boolean,
  onClose: () => void,
  onSave: (user: User) => Promise<void>,
  companies: Company[]
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

const UserManagementPage = ({ 
  users, 
  onAddUser, 
  onEditUser, 
  onDeleteUser,
  companies
}: { 
  users: User[],
  onAddUser: () => void,
  onEditUser: (user: User) => void,
  onDeleteUser: (id: string) => void,
  companies: Company[]
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Access Control Center</h2>
          <p className="text-sm text-slate-500 mt-1">Orchestrate granular identity and resource permissions</p>
        </div>
        <button 
          onClick={onAddUser}
          className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Plus size={18} />
          Add New User
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* User List */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-400" />
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Security Subjects</h3>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Lookup identity..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all" 
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/30 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-100">User Identity</th>
                  <th className="px-6 py-4 border-b border-slate-100">Auth Role</th>
                  <th className="px-6 py-4 border-b border-slate-100">Resource Footprint</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-50">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td 
                      className="px-6 py-5 cursor-pointer"
                      onClick={() => onEditUser(user)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500 border border-slate-200 group-hover:scale-105 group-hover:border-indigo-200 transition-all">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-none group-hover:text-indigo-600 transition-colors">{user.name}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-1">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          user.role === 'Admin' ? 'bg-indigo-100 text-indigo-700' : 
                          user.role === 'Manager' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {user.role}
                        </span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase block mt-1 tracking-tighter">Status: {user.status}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5">
                        {user.permissions.map(p => {
                          const company = companies.find(c => c.id === p.companyId);
                          return (
                            <div key={p.companyId} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 shadow-sm">
                              <Building2 size={10} className="text-slate-400" />
                              {company?.name || p.companyId}
                              <span className="bg-slate-100 text-[9px] px-1 rounded ml-1 text-slate-400">
                                {p.bankIds.length === 0 ? 'ALL' : p.bankIds.length}
                              </span>
                            </div>
                          );
                        })}
                        {user.permissions.length === 0 && <span className="text-slate-400 italic text-xs">No active permissions</span>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onEditUser(user)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Edit User"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => onDeleteUser(user.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                          title="Revoke Access"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                      No matching identities found in current scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Security Summary */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-900/20 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Lock size={20} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm leading-none">Security Policy</h3>
                <p className="text-[10px] text-white/40 mt-1 uppercase font-bold tracking-widest">Active Enforcement</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Total Identities</p>
                  <Users size={12} className="text-white/40" />
                </div>
                <p className="text-2xl font-bold font-mono tracking-tighter">{users.length}</p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Resource Coverage</p>
                  <Globe size={12} className="text-white/40" />
                </div>
                <p className="text-2xl font-bold font-mono tracking-tighter">100%</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all">
                Export Audit Log
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">System Health</h4>
                <Activity size={14} className="text-emerald-500" />
             </div>
             <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-xs text-slate-500">MFA Adoption</span>
                   <span className="text-xs font-bold text-slate-900">84%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 rounded-full" style={{ width: '84%' }} />
                </div>
                <div className="flex items-center justify-between mt-4">
                   <span className="text-xs text-slate-500">Failed Attempts</span>
                   <span className="text-xs font-bold text-red-500">0 (24h)</span>
                </div>
             </div>
          </div>
        </div>
      </div>
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

interface SparkPoint { date: string; value: number; }

const SparklineChart = ({
  data, color, gradId, height = 36, dark = false,
  fmtVal,
}: {
  data: SparkPoint[];
  color: string;
  gradId: string;
  height?: number;
  dark?: boolean;
  fmtVal: (n: number) => string;
}) => {
  const [tip, setTip] = useState<{ px: number; py: number; date: string; val: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 320;
  const todayStr = new Date().toISOString().slice(0, 10);

  const fallback: SparkPoint[] = data.length >= 2 ? data : [
    { date: '', value: 20 }, { date: '', value: 30 }, { date: '', value: 25 },
    { date: '', value: 40 }, { date: '', value: 35 }, { date: '', value: 50 },
    { date: '', value: 45 }, { date: '', value: 60 }, { date: '', value: 55 },
    { date: '', value: 70 },
  ];
  const pts_raw = fallback;
  const vals = pts_raw.map(d => d.value);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = pts_raw.map((d, i) => ({
    x: (i / (pts_raw.length - 1)) * W,
    y: height - ((d.value - mn) / rng) * height * 0.75 - height * 0.1,
    date: d.date,
    val: d.value,
    isToday: d.date === todayStr,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${W} ${height} L 0 ${height} Z`;

  const handleEnter = (p: typeof pts[0]) => (e: MouseEvent<SVGCircleElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / height;
    setTip({ px: p.x * scaleX, py: p.y * scaleY, date: p.date, val: p.val });
  };

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={dark ? '0.4' : '0.25'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={dark ? '2' : '1.8'} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dot + invisible hit area for each point */}
        {pts.map((p, i) => (
          <g key={i}>
            {/* Always show dot for all real data points */}
            {p.date && (
              <>
                {/* outer glow ring for today */}
                {p.isToday && (
                  <circle cx={p.x} cy={p.y} r={dark ? 7 : 6} fill={color} opacity={0.2} />
                )}
                {/* main dot — today is bigger and filled white on dark */}
                <circle
                  cx={p.x} cy={p.y}
                  r={p.isToday ? (dark ? 5 : 4) : (dark ? 3 : 2.5)}
                  fill={p.isToday ? (dark ? '#ffffff' : color) : (dark ? '#a5b4fc' : color)}
                  opacity={p.isToday ? 1 : 0.7}
                />
              </>
            )}
            {/* invisible large hit area */}
            <circle cx={p.x} cy={p.y} r={10} fill="transparent"
              onMouseEnter={p.date ? handleEnter(p) : undefined}
              style={{ cursor: p.date ? 'crosshair' : 'default' }} />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {tip && tip.date && (
        <div
          className={`absolute z-20 pointer-events-none rounded-lg px-2.5 py-1.5 shadow-xl text-xs whitespace-nowrap ${
            dark ? 'bg-white text-slate-800' : 'bg-slate-800 text-white'
          }`}
          style={{ left: tip.px, top: tip.py, transform: 'translate(-50%, -120%)' }}
        >
          <p className="font-bold mb-0.5">{tip.date === todayStr ? `${tip.date} (Today)` : tip.date}</p>
          <p className="font-mono">{fmtVal(tip.val)}</p>
          {/* arrow */}
          <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${
            dark ? 'border-t-white' : 'border-t-slate-800'
          }`} />
        </div>
      )}
    </div>
  );
};

// --- Header Component ---

const Header = ({
  title, searchTerm, onSearch, onMenuClick, onLogout,
}: {
  title: string;
  searchTerm: string;
  onSearch: (val: string) => void;
  onMenuClick: () => void;
  onLogout: () => void;
}) => {
  return (
    <header className="bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0 gap-3 h-14 md:h-16">
      {/* Left — hamburger + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base md:text-lg font-semibold text-slate-900 leading-none truncate">{title}</h1>
        <span className="text-slate-300 hidden lg:block">|</span>
        <span className="text-sm text-slate-500 hidden lg:block">
          Active View: <span className="font-medium text-slate-900 uppercase tracking-wider text-[11px]">Secure Connection</span>
        </span>
      </div>

      {/* Right — search + bell */}
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
        <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
          <Bell size={18} />
        </button>
        <button
          onClick={onLogout}
          title="Sign out"
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={18} />
        </button>
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

  const [activePage, setActivePage] = useState<Page>('dashboard');
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

  useEffect(() => {
    if (authUser?.role === 'Admin') loadUsers();
  }, [authUser]);

  const [alerts, setAlerts] = useState<WalletAlert[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<{ date: string; fiat: number; crypto: number; total: number; }[]>([]);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [selectedBankDetails, setSelectedBankDetails] = useState<Bank | null>(null);
  const [isBankDetailsModalOpen, setIsBankDetailsModalOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleShowBankDetails = (bank: Bank) => {
    setSelectedBankDetails(bank);
    setIsBankDetailsModalOpen(true);
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
    if (activePage === 'psp') return 'Payment Providers';
    if (activePage === 'users') return 'User Management';
    if (activePage === 'alerts') return 'Alert Configuration';
    if (activePage === 'upload') return 'Manual Data Upload';
    if (!selectedCompanyId) return 'Liquidity Overview';
    return companies.find(c => c.id === selectedCompanyId)?.name || 'Dashboard';
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
      />

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <Header
          title={selectedCompanyName}
          searchTerm={searchQuery}
          onSearch={setSearchQuery}
          onMenuClick={() => setSidebarOpen(true)}
          onLogout={handleLogout}
        />

        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activePage === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 md:space-y-8"
              >
                <div className="space-y-6">

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

                    {/* ── Bottom bar — date · sync · button ── */}
                    <div className="border-t border-slate-100 px-5 py-3 flex flex-wrap items-center gap-4">
                      {/* Date picker */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                        <input
                          type="date"
                          max={todayStr}
                          value={historyDate || todayStr}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === todayStr) handleDateChange('');
                            else handleDateChange(val);
                          }}
                          className="text-xs font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
                        />
                      </div>

                      {/* Last Global Sync */}
                      {!isHistoricalMode && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Global Sync</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-mono font-bold text-slate-700">{lastSynced}</span>
                        </div>
                      )}

                      {/* Sync All button */}
                      {!isHistoricalMode && (
                        <button
                          onClick={handleRefresh}
                          disabled={isRefreshing}
                          className={`ml-auto flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                            isRefreshing
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                          }`}
                        >
                          <Globe size={13} className={isRefreshing ? 'animate-spin' : ''} />
                          {isRefreshing ? 'Syncing…' : 'Sync All'}
                        </button>
                      )}
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
                            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">All Companies</span>
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

                  <div className="space-y-12">
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
                      filteredCompanies.map(company => (
                        <div key={company.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                              <h3 className="text-xl font-bold text-slate-800 tracking-tight">{company.name}</h3>
                              {company.industry && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                  {company.industry}
                                </span>
                              )}
                              {company.status === 'Onboarding' && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase animate-pulse">
                                  Onboarding
                                </span>
                              )}
                            </div>
                          </div>
                          
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
                                 onClick={() => handleShowBankDetails(company.banks[0])}
                                 className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group"
                               >
                                 Full Ledger View <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                               </button>
                             )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-12 flex flex-col items-center gap-4 pb-12">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                     System Maintenance & Troubleshooting
                   </p>
                   <button 
                     onClick={() => setShowDebug(!showDebug)}
                     className="px-6 py-3 bg-white text-slate-800 rounded-2xl text-xs font-bold hover:shadow-lg hover:bg-slate-50 transition-all shadow-sm flex items-center gap-3 border border-slate-200 group"
                   >
                     <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                        <Terminal size={14} />
                     </div>
                     <div className="text-left">
                        <p className="leading-none">Open Technical Diagnostics</p>
                        <p className="text-[9px] text-slate-400 mt-1 font-medium">Verify live data payload and server endpoints</p>
                     </div>
                   </button>
                </div>

                {showDebug && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-slate-950 w-full max-w-4xl max-h-[80vh] rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Terminal size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Live Data Diagnostics</h3>
                            <p className="text-[10px] text-slate-500 font-medium">Real-time view of state and cache</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              localStorage.removeItem('smarttool_data');
                              window.location.reload();
                            }}
                            className="px-3 py-1.5 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
                          >
                            Hard Reset state
                          </button>
                          <button 
                            onClick={() => setShowDebug(false)}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto p-6 font-mono text-[11px]">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                           <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                              <p className="text-slate-500 uppercase font-bold text-[9px] mb-2 tracking-widest">Active State</p>
                              <div className="space-y-1">
                                 <p className="text-emerald-400">• Total Companies: {companies.length}</p>
                                 <p className="text-emerald-400">• Current View: {selectedCompanyId || 'ALL'}</p>
                                 <p className="text-emerald-400">• Last Global Sync: {lastSynced}</p>
                              </div>
                           </div>
                           <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                              <p className="text-slate-500 uppercase font-bold text-[9px] mb-2 tracking-widest">Persistence</p>
                              <div className="space-y-1">
                                 <p className="text-indigo-400">• LocalCache: {localStorage.getItem('smarttool_data') ? 'PRESENT' : 'EMPTY'}</p>
                                 <p className="text-indigo-400">• Cache Size: {(localStorage.getItem('smarttool_data')?.length || 0).toLocaleString()} bytes</p>
                                 <p className="text-indigo-400 mt-2">• API Endpoint: {window.location.origin}/api/update-data</p>
                              </div>
                           </div>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                           <p className="text-slate-500 uppercase font-bold text-[9px] mb-4 tracking-widest">Raw Company JSON</p>
                           <pre className="text-emerald-500 leading-relaxed whitespace-pre-wrap">{JSON.stringify(companies, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activePage === 'psp' && (
              <motion.div
                key="psp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto p-4 md:p-8"
              >
                <PSPPage companies={companies} />
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
          </AnimatePresence>
        </main>

        <UserModal 
          user={editingUser}
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          onSave={handleSaveUser}
          companies={companies}
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
