'use client';

import { useEffect, useState } from 'react';

interface ScanResult {
  domain: string;
  googleMX: boolean;
  legacyCNAME: boolean;
  startCNAME: boolean;
  adminConsole: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
}

interface LastScan {
  timestamp: string;
  scanned: number;
  hitsFound: number;
  batchStart: number;
}

interface LastDiscover {
  timestamp: string;
  discovered: number;
  source: string;
}

export default function Dashboard() {
  const [hits, setHits] = useState<ScanResult[]>([]);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [lastDiscover, setLastDiscover] = useState<LastDiscover | null>(null);
  const [totalDomains, setTotalDomains] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');

  const login = () => {
    fetch(`/api/results?pw=${encodeURIComponent(pw)}`)
      .then(r => {
        if (r.status === 401) { setError('Wrong password'); return null; }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setAuthed(true);
        setHits(data.hits || []);
        setLastScan(data.lastScan);
        setLastDiscover(data.lastDiscover);
        setTotalDomains(data.totalDomains);
        setProgress(data.progress);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('lgf_pw');
    if (saved) { setPw(saved); }
  }, []);

  useEffect(() => {
    if (!authed && pw) {
      fetch(`/api/results?pw=${encodeURIComponent(pw)}`)
        .then(r => r.status === 401 ? null : r.json())
        .then(data => {
          if (!data) return;
          sessionStorage.setItem('lgf_pw', pw);
          setAuthed(true);
          setHits(data.hits || []);
          setLastScan(data.lastScan);
          setLastDiscover(data.lastDiscover);
          setTotalDomains(data.totalDomains);
          setProgress(data.progress);
          setLoading(false);
        });
    }
  }, []);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-80">
          <h1 className="text-xl font-bold mb-1">Legacy Google Finder</h1>
          <p className="text-gray-400 text-sm mb-6">Private dashboard</p>
          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-500"
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
          />
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <button
            onClick={login}
            className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const tier1 = hits.filter(h => h.score >= 80);
  const tier2 = hits.filter(h => h.score >= 60 && h.score < 80);
  const tier3 = hits.filter(h => h.score < 60);

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Legacy Google Finder</h1>
          <p className="text-gray-400">Auto-discovers & scans pre-2012 domains for active legacy Google Apps panels</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Queued', value: totalDomains },
            { label: 'Total Hits', value: hits.length, color: 'text-green-400' },
            { label: 'Tier 1 (80+)', value: tier1.length, color: 'text-emerald-400' },
            { label: 'Tier 2 (60+)', value: tier2.length, color: 'text-yellow-400' },
            { label: 'Progress', value: `${progress}%` },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color || ''}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6">
          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
        </div>

        {/* Scan status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8 text-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
            <span className="text-gray-400">Last scan:</span>
            <span>{lastScan ? new Date(lastScan.timestamp).toLocaleString() : 'Never'}</span>
            {lastScan && <span className="text-gray-500 ml-auto">{lastScan.scanned} checked, {lastScan.hitsFound} hits</span>}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
            <span className="text-gray-400">Last discover:</span>
            <span>{lastDiscover ? new Date(lastDiscover.timestamp).toLocaleString() : 'Never'}</span>
            {lastDiscover && <span className="text-gray-500 ml-auto">+{lastDiscover.discovered} domains</span>}
          </div>
        </div>

        {/* Results */}
        <h2 className="text-lg font-semibold mb-4">Confirmed Hits</h2>
        {hits.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center text-gray-400">
            No hits yet. Discovery runs every 6 hours, scanning runs every hour.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden text-sm">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">MX</th>
                  <th className="px-4 py-3 text-center">CNAME</th>
                  <th className="px-4 py-3 text-center">start.*</th>
                  <th className="px-4 py-3 text-center">Admin</th>
                  <th className="px-4 py-3 text-center">Reg. Year</th>
                  <th className="px-4 py-3 text-left">Found</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit, i) => (
                  <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-mono text-blue-400">
                      <a href={`https://${hit.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {hit.domain}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        hit.score >= 80 ? 'bg-emerald-900 text-emerald-300' :
                        hit.score >= 60 ? 'bg-yellow-900 text-yellow-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {hit.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{hit.googleMX ? '✅' : '❌'}</td>
                    <td className="px-4 py-3 text-center">{hit.legacyCNAME ? '✅' : '❌'}</td>
                    <td className="px-4 py-3 text-center">{hit.startCNAME ? '✅' : '❌'}</td>
                    <td className="px-4 py-3 text-center">{hit.adminConsole ? '✅' : '❌'}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{hit.registrationYear ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(hit.timestamp).toLocaleDateString()}</td>
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
