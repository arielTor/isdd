import { CreditCard, Info } from 'lucide-react';
import { Company } from './types';
import PSPSection, { fmtUsd, walletTotalUsd } from './PSPSection';

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
              <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{fmtUsd(usd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-indigo-50 border-t border-indigo-100">
            <td className="px-4 py-2.5 font-bold text-indigo-700 uppercase text-[10px] tracking-widest">Total</td>
            <td className="px-4 py-2.5 text-right font-mono font-bold text-sm text-slate-800">{fmtUsd(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const PSPPage = ({ companies }: { companies: Company[] }) => {
  const companiesWithPsp = companies.filter(c => (c.psp_providers || []).length > 0);

  if (companiesWithPsp.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <CreditCard size={24} className="text-slate-300" />
        </div>
        <h4 className="text-slate-900 font-bold text-lg">No Payment Providers Connected</h4>
        <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">
          Once a company has a PSP integration (e.g. Rapyd) synced into the database, it will appear here.
        </p>
      </div>
    );
  }

  const byPsp: Record<string, number> = {};
  const byCompany: Record<string, number> = {};
  const byCurrency: Record<string, number> = {};

  companiesWithPsp.forEach(company => {
    (company.psp_providers || []).forEach(provider => {
      provider.ewallets.forEach(ew => {
        ew.wallets.forEach(w => {
          const usd = walletTotalUsd(w);
          byPsp[provider.name] = (byPsp[provider.name] || 0) + usd;
          byCompany[company.name] = (byCompany[company.name] || 0) + usd;
          byCurrency[w.currency] = (byCurrency[w.currency] || 0) + usd;
        });
      });
    });
  });

  return (
    <div className="space-y-6">
      {/* Single page-level reminder — not repeated on every widget */}
      <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
        <Info size={16} className="text-indigo-600 shrink-0" />
        <p className="text-sm text-indigo-700">
          Funds shown on this page are held by your payment providers and have <strong>not yet settled</strong> into your bank accounts.
          They are tracked separately from the Dashboard's settled totals.
        </p>
      </div>

      {/* Summary mini tables — PSP-only */}
      <div className="flex gap-4 flex-wrap">
        <MiniTable title="By PSP" data={byPsp} />
        <MiniTable title="By Company" data={byCompany} />
        <MiniTable title="By Currency" data={byCurrency} />
      </div>

      {/* Per-company PSP cards */}
      <div className="space-y-6">
        {companiesWithPsp.map(company => (
          <PSPSection key={company.id} company={company} />
        ))}
      </div>
    </div>
  );
};

export default PSPPage;
