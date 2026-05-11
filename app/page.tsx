'use client';

import { useEffect, useState, useCallback } from 'react';

interface Hit {
  domain: string;
  googleMX: boolean;
  legacyCNAME: boolean;
  startCNAME: boolean;
  adminConsole: boolean;
  spfGoogle: boolean;
  historicalGoogleSites: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
  bought: boolean;
}

const TIER = (score: number) =>
  score >= 80 ? { label: 'S', bg: 'bg-emerald-900', text: 'text-emerald-300' } :
  score >= 60 ? { label: 'A', bg: 'bg-blue-900', text: 'text-blue-300' } :
  score >= 40 ? { label: 'B', bg: 'bg-yellow-900', text: 'text-yellow-300' } :
               { label: 'C', bg: 'bg-gray-700', text: 'text-gray-300' };

function ScoreBadge({ score }: { score: number }) {
  const t = TIER(score);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${t.bg} ${t.text}`}>
      <span className="opacity-60">{t.label}</span> {score}
    </span>
  );
}

function Signal({ on, label }: { on: boolean; label: string }) {
  return (
    <span title={label} className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-green-400' : 'bg-gray-700'}`} />
  );
}

export default function Dashboard() {
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'available' | 'bought'>('available');
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, progress: 0, lastScan: '', lastDiscover: '' });

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch('/api/results')
      .then(r => r.json())
      .then(data => {
        const sorted = (data.hits || []).sort((a: Hit, b: Hit) => b.score - a.score);
        setHits(sorted);
        setStats({
          total: data.totalDomains,
          progress: data.progress,
          lastScan: data.lastScan?.timestamp || '',
          lastDiscover: data.lastDiscover?.timestamp || '',
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleBought = async (domain: string, current: boolean) => {
    setPendingToggle(domain);
    await fetch('/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, bought: !current }),
    });
    setHits(prev => prev.map(h => h.domain === domain ? { ...h, bought: !current } : h));
    setPendingToggle(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const available = hits.filter(h => !h.bought);
  const bought = hits.filter(h => h.bought);
  const shown = tab === 'available' ? available : bought;

  const tierCounts = {
    S: available.filter(h => h.score >= 80).length,
    A: available.filter(h => h.score >= 60 && h.score < 80).length,
    B: available.filter(h => h.score >= 40 && h.score < 60).length,
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Legacy Google Finder</h1>
            <p className="text-gray-500 text-sm">Auto-discovers & scans pre-2012 domains for active Google Apps panels</p>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 rounded px-3 py-1.5 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Queued', value: stats.total },
            { label: 'Scanned', value: `${stats.progress}%` },
            { label: 'Tier S (80+)', value: tierCounts.S, color: 'text-emerald-400' },
            { label: 'Tier A (60+)', value: tierCounts.A, color: 'text-blue-400' },
            { label: 'Bought', value: bought.length, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color || ''}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Scan status */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-6 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>
            Last scan:{' '}
            <span className="text-gray-300">{stats.lastScan ? new Date(stats.lastScan).toLocaleString() : 'Never'}</span>
          </span>
          <span>
            Last discover:{' '}
            <span className="text-gray-300">{stats.lastDiscover ? new Date(stats.lastDiscover).toLocaleString() : 'Never'}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-40 bg-gray-800 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${stats.progress}%` }} />
            </div>
            <span>{stats.progress}%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {(['available', 'bought'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'available' ? `Available (${available.length})` : `Bought (${bought.length})`}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><Signal on label="MX" /> Google MX</span>
          <span className="flex items-center gap-1.5"><Signal on label="CNAME" /> Legacy CNAME</span>
          <span className="flex items-center gap-1.5"><Signal on label="start.*" /> start.* subdomain</span>
          <span className="flex items-center gap-1.5"><Signal on label="Admin" /> Admin console</span>
        </div>

        {/* Table */}
        {shown.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center text-gray-500">
            {tab === 'available'
              ? 'No hits yet — discovery runs every 6h, scanning every hour.'
              : 'No domains marked as bought yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-center">Score</th>
                  <th className="px-3 py-2 text-center">Signals</th>
                  <th className="px-3 py-2 text-center">Reg. Year</th>
                  <th className="px-3 py-2 text-left">Found</th>
                  <th className="px-3 py-2 text-center">Bought</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((hit, i) => (
                  <tr
                    key={hit.domain}
                    className={`border-b border-gray-800/60 hover:bg-gray-900/60 transition-colors ${hit.bought ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-3 text-gray-600 text-xs">{tab === 'available' ? i + 1 : ''}</td>
                    <td className="px-3 py-3 font-mono">
                      <a href={`https://${hit.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {hit.domain}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-center"><ScoreBadge score={hit.score} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <Signal on={hit.googleMX} label="Google MX" />
                        <Signal on={hit.legacyCNAME} label="Legacy CNAME (ghs.google.com)" />
                        <Signal on={hit.startCNAME} label="start.* CNAME" />
                        <Signal on={hit.adminConsole} label="Admin console redirect" />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-400">{hit.registrationYear ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{new Date(hit.timestamp).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleBought(hit.domain, hit.bought)}
                        disabled={pendingToggle === hit.domain}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                          hit.bought ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-600 hover:border-purple-500'
                        } ${pendingToggle === hit.domain ? 'opacity-40' : ''}`}
                        title={hit.bought ? 'Mark as not bought' : 'Mark as bought'}
                      >
                        {hit.bought && (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
