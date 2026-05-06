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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, Fragment, useRef } from 'react';
import { MOCK_COMPANIES } from './mockData';
import { CURRENCY_SYMBOLS, Company, Bank, BankAccount, User, UserRole, WalletAlert, ExchangeRate } from './types';

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
type Page = 'dashboard' | 'users' | 'alerts';

// --- Sidebar Component ---

const Sidebar = ({ 
  companies,
  selectedCompanyId, 
  onSelectCompany,
  activePage,
  onNavigate
}: { 
  companies: Company[],
  selectedCompanyId: string | null, 
  onSelectCompany: (id: string | null) => void,
  activePage: Page,
  onNavigate: (page: Page) => void
}) => {
  return (
    <div className="w-64 h-full bg-sidebar-bg text-white flex flex-col shrink-0">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
          L
        </div>
        <span className="text-xl font-bold tracking-tight">Liquidity Dashboard</span>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Companies</div>
        
        <button 
          onClick={() => {
            onSelectCompany(null);
            onNavigate('dashboard');
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
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'users', icon: Users, label: 'User Management' },
            { id: 'alerts', icon: BellRing, label: 'Alert Center' },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => onNavigate(item.id as Page)}
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
        <div className="flex items-center gap-3 p-2 group cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold ring-1 ring-slate-500 group-hover:ring-indigo-400 transition-all">
            AT
          </div>
          <div className="text-xs truncate">
            <div className="font-medium text-slate-200">Arik T.</div>
            <div className="text-slate-500">Smart Admin</div>
          </div>
        </div>
      </div>
    </div>
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
  onSave: (user: User) => void,
  companies: Company[]
}) => {
  const [formData, setFormData] = useState<Partial<User>>(user || {
    name: '',
    email: '',
    role: 'Viewer',
    status: 'Active',
    permissions: []
  });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800">{user ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
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
          <p className="text-[10px] text-slate-400 font-medium max-w-[200px]">
            * Permissions are immediately applied upon saving.
          </p>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => onSave({ 
                ...formData, 
                id: user?.id || `u_${Date.now()}`, 
                lastActive: user?.lastActive || 'Never' 
              } as User)}
              disabled={!formData.name || !formData.email}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-lg shadow-slate-900/10 hover:bg-slate-800 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
            >
              {user ? 'Update User' : 'Grant Access'}
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
          Provision New Identity
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
      const wallets = selectedBank.accounts.flatMap(acc => acc.wallets);
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
                {selectedBank?.accounts.flatMap(acc => acc.wallets).map(w => (
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

// --- Header Component ---

const Header = ({ title, searchTerm, onSearch }: { title: string, searchTerm: string, onSearch: (val: string) => void }) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-900 leading-none">{title}</h1>
        <span className="text-slate-300">|</span>
        <span className="text-sm text-slate-500">Active View: <span className="font-medium text-slate-900 uppercase tracking-wider text-[11px]">Secure Connection</span></span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-md text-xs font-medium border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Syncing
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search resources..." 
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            className="w-64 h-9 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
        </div>
        <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
          <Bell size={18} />
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

  const totalBalance = allWallets.reduce((sum, wallet) => {
    return sum + (wallet.balance || 0);
  }, 0);

  const currencyTotals = allWallets.reduce((acc, wallet) => {
    acc[wallet.currency] = (acc[wallet.currency] || 0) + (wallet.balance || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
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
            {Object.entries(currencyTotals).map(([currency, total]) => (
              <div key={currency} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total {currency}</p>
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {CURRENCY_SYMBOLS[currency] || ''} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                          const converted = convertCurrency(wallet.balance, wallet.currency);
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
                                   {CURRENCY_SYMBOLS[wallet.currency] || ''} {(wallet.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                                {converted && (
                                  <p className="text-[10px] font-bold text-slate-400 font-mono italic">
                                    ≈ {converted.label} {converted.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </p>
                                )}
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
                    <span>{CURRENCY_SYMBOLS[wallet.currency] || ''} {wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
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
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('smarttool_data');
    if (!saved) return [];
    
    try {
      const parsedSaved = JSON.parse(saved);
      // If it's the wrapped object, extract dashboard_data
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

  // User Management State
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('smarttool_users');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'u1',
        name: 'Arik T.',
        email: 'arik@smarttool.com',
        role: 'Admin',
        status: 'Active',
        lastActive: '2 mins ago',
        permissions: [] // Initial admin with no explicit perms, effectively "All" in logic usually
      }
    ];
  });

  const [alerts, setAlerts] = useState<WalletAlert[]>(() => {
    const saved = localStorage.getItem('smarttool_alerts');
    return saved ? JSON.parse(saved) : [];
  });

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [selectedBankDetails, setSelectedBankDetails] = useState<Bank | null>(null);
  const [isBankDetailsModalOpen, setIsBankDetailsModalOpen] = useState(false);
  const [firedAlertIds, setFiredAlertIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('smarttool_fired_alerts');
    return saved ? JSON.parse(saved) : [];
  });
  const [showDebug, setShowDebug] = useState(false);

  const handleShowBankDetails = (bank: Bank) => {
    setSelectedBankDetails(bank);
    setIsBankDetailsModalOpen(true);
  };

  useEffect(() => {
    localStorage.setItem('smarttool_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('smarttool_alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('smarttool_fired_alerts', JSON.stringify(firedAlertIds));
  }, [firedAlertIds]);

  // Monitoring Effect: Check for alerts that hit a threshold
  useEffect(() => {
    const newFiredIds = [...firedAlertIds];
    let changed = false;

    alerts.forEach(alert => {
      if (!alert.isEnabled) return;

      const company = companies.find(c => c.id === alert.companyId);
      const bank = company?.banks.find(b => b.id === alert.bankId);
      const wallet = bank?.accounts.flatMap(acc => acc.wallets).find(w => w.id === alert.walletId);

      if (wallet && wallet.balance <= alert.threshold) {
        // Threshold triggered
        if (!newFiredIds.includes(alert.id)) {
          // Fire for the first time
          console.log(`THRESHOLD HIT: Alert ${alert.id} triggered for ${wallet.id}`);
          
          const payload = {
            alert_id: alert.id,
            company: company?.name,
            bank: bank?.name,
            wallet_id: wallet.id,
            currency: wallet.currency,
            amount: wallet.balance,
            threshold: alert.threshold,
            email_address: alert.email,
            // Context of all wallets in the bank
            all_bank_wallets: bank?.accounts.flatMap(acc => acc.wallets).map(w => ({
              id: w.id,
              balance: w.balance,
              currency: w.currency
            }))
          };

          fetch('/api/alerts/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => console.error('Alert notification failure:', err));

          newFiredIds.push(alert.id);
          changed = true;
        }
      } else if (wallet && wallet.balance > alert.threshold) {
        // Reset if it's back to normal (allows firing again if it hits threshold later)
        const idx = newFiredIds.indexOf(alert.id);
        if (idx !== -1) {
          newFiredIds.splice(idx, 1);
          changed = true;
        }
      }
    });

    if (changed) {
      setFiredAlertIds(newFiredIds);
    }
  }, [companies, alerts, firedAlertIds]); // Re-run when data, rules, or state change

  const handleAddUser = () => {
    setEditingUser(null);
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const handleDeleteUser = (userId: string) => {
    // Check to prevent self-deletion
    const user = users.find(u => u.id === userId);
    if (user?.name === 'Arik T.') {
      console.warn('Cannot delete the primary admin.');
      return;
    }
    setUsers(users.filter(u => u.id !== userId));
  };

  const handleSaveUser = async (user: User) => {
    if (editingUser) {
      setUsers(users.map(u => u.id === user.id ? user : u));
    } else {
      setUsers([...users, user]);
    }

    // Call backend to trigger Zapier (User creation/update)
    console.log('Firing user sync for:', user.name);
    try {
      const response = await fetch('/api/users/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      const result = await response.json();
      console.log('User sync result:', result);
    } catch (e) {
      console.error('Failed to trigger user sync error:', e);
    }

    setIsUserModalOpen(false);
  };

  const handleAddAlert = async (newAlert: Partial<WalletAlert>) => {
    // The App is in charge of unique Alert ID creation
    const alertId = `alt-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    
    const alert: WalletAlert = {
      ...newAlert,
      id: alertId
    } as WalletAlert;
    
    // Call backend to trigger Zapier (Add alert)
    try {
      fetch('/api/alerts/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
    } catch (e) {
      console.error('Failed to trigger alert sync:', e);
    }

    setAlerts([...alerts, alert]);
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const handleToggleAlert = async (id: string) => {
    const updatedAlerts = alerts.map(a => a.id === id ? { ...a, isEnabled: !a.isEnabled } : a);
    const modifiedAlert = updatedAlerts.find(a => a.id === id);
    
    // Call backend to trigger Zapier (Change alert - Toggle)
    if (modifiedAlert) {
      try {
        fetch('/api/alerts/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modifiedAlert)
        });
      } catch (e) {
        console.error('Failed to trigger alert toggle sync:', e);
      }
    }
    
    setAlerts(updatedAlerts);
  };

  const filteredCompanies = useMemo(() => {
    let result = companies;
    
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
  }, [selectedCompanyId, companies, searchQuery]);

  const filteredBanks = useMemo(() => {
    return filteredCompanies.flatMap(c => c.banks);
  }, [filteredCompanies]);

  const selectedCompanyName = useMemo(() => {
    if (activePage === 'users') return 'User Management';
    if (activePage === 'alerts') return 'Alert Configuration';
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
        
        handleRefresh();
      } catch (err) {
        console.error('Initial setup failed:', err);
        handleRefresh();
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
    const initiatedAt = Date.now();
    try {
      // POST to our backend proxy to avoid CORS issues
      await fetch('/api/external-proxy-sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: companies })
      });
      
      // Wait a bit for the external service to process and push back to our dashboard
      await new Promise(resolve => setTimeout(resolve, 2000));

      let dataFound = false;
      // Increased polling frequency (every 1s) and maintained 120s total
      for (let i = 0; i < 120; i++) {
        const res = await fetch('/api/liquidity');
        const result = await res.json();
        
        const data = result.data || result.dashboard_data || (Array.isArray(result) ? result : null);
        const lastUpdate = result.lastUpdateTime || 0;

        // Detection logic:
        // 1. Actually new (updated after we clicked Sync)
        // 2. Different from our current state (someone updated it externally)
        const isActuallyNew = lastUpdate >= (initiatedAt - 2000); 
        const isDifferent = JSON.stringify(data) !== JSON.stringify(companiesRef.current);

        if (data && Array.isArray(data) && data.length > 0 && (isActuallyNew || isDifferent)) {
          console.log('%c [Sync] New data detected!', 'color: #22c55e; font-weight: bold;');
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
          
          dataFound = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (!dataFound) {
        console.warn('Sync still in progress or failed to return data within 120s.');
        const res = await fetch('/api/liquidity');
        const result = await res.json();
        const data = result.data || result.dashboard_data || (Array.isArray(result) ? result : null);
        const lastUpdate = result.lastUpdateTime || 0;
        
        if (data && data.length > 0) {
          setCompanies(data);
          const syncTime = new Date(lastUpdate).toLocaleTimeString('en-GB', { 
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

  const stats = useMemo(() => {
    return {
      nodes: filteredBanks.length
    };
  }, [filteredBanks]);

  const hasAnyWallets = (c: Company) => (c.banks || []).some(b => (b.accounts || []).some(acc => (acc.wallets || []).length > 0));

  return (
    <div className="flex h-screen w-full overflow-hidden selection:bg-indigo-600/10 selection:text-indigo-600 font-sans">
      <Sidebar 
        companies={companies}
        selectedCompanyId={selectedCompanyId} 
        onSelectCompany={setSelectedCompanyId} 
        activePage={activePage}
        onNavigate={setActivePage}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <Header 
          title={selectedCompanyName} 
          searchTerm={searchQuery}
          onSearch={setSearchQuery}
        />

        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activePage === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto p-8 space-y-8"
              >
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                          {isRefreshing ? <Globe size={18} className="animate-spin" /> : <LayoutDashboard size={18} />}
                       </div>
                       <div>
                          <h3 className="text-xl font-bold text-slate-900">Asset Breakdown</h3>
                          <div className="flex items-center gap-2">
                             <p className="text-xs text-slate-500 font-medium tracking-tight">
                                Aggregated visibility across all linked accounts and wallets
                             </p>
                             {isRefreshing && <span className="text-[10px] text-indigo-600 font-bold animate-pulse uppercase tracking-widest ml-2">Syncing Data...</span>}
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center gap-6">
                       <div className="text-right hidden sm:flex flex-col items-end">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Last Global Sync</p>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-xs text-slate-700 font-mono font-bold">{lastSynced}</p>
                          </div>
                       </div>
                       <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                            isRefreshing 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/10'
                        }`}
                       >
                          {isRefreshing ? <Globe size={14} className="animate-spin" /> : <Globe size={14} />}
                          {isRefreshing ? 'Refreshing Hub...' : 'Sync All Accounts'}
                       </button>
                    </div>
                  </div>

                  <div className="space-y-12">
                    {filteredCompanies.length === 0 ? (
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
                                      lastSync: bank.last_modified || bank.last_modified_date
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
                                    const usdVal = wallet.value_usd ?? wallet.usd_value ?? wallet.valueUsd ?? wallet.usdValue;
                                    const converted = usdVal !== undefined && usdVal !== null
                                      ? { amount: Number(usdVal), label: 'USDT' }
                                      : convertCurrency(wallet.balance, wallet.currency);
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
                                          {CURRENCY_SYMBOLS[wallet.currency] || ''} {(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="px-6 py-4 border-b border-slate-100 text-right">
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${wallet.currency === 'USD' || wallet.currency === 'USDT' ? 'bg-emerald-100 text-emerald-700' : wallet.currency === 'BTC' || wallet.currency === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {wallet.currency}
                                          </span>
                                        </td>
                                        <td className="px-6 py-4 border-b border-slate-100 text-right font-mono font-bold italic text-slate-400">
                                          {converted ? `≈ ${converted.label} ${converted.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
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
