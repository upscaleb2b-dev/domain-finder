import { Resend } from 'resend';
import type { ScanResult } from './score';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || 'placeholder');
}

export async function sendHitEmail(hits: ScanResult[]) {
  const to = process.env.ALERT_EMAIL;
  const from = process.env.ALERT_FROM || 'scanner@notifications.dev';
  if (!to || !process.env.RESEND_API_KEY) return;

  const rows = hits
    .map(h => `
      <tr>
        <td style="padding:8px 12px;font-family:monospace;color:#60a5fa">${h.domain}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:bold;color:${h.score >= 80 ? '#34d399' : '#fbbf24'}">${h.score}</td>
        <td style="padding:8px 12px;text-align:center">${h.googleMX ? '✅' : '❌'}</td>
        <td style="padding:8px 12px;text-align:center">${h.legacyCNAME ? '✅' : '❌'}</td>
        <td style="padding:8px 12px;text-align:center">${h.startCNAME ? '✅' : '❌'}</td>
        <td style="padding:8px 12px;text-align:center">${h.adminConsole ? '✅' : '❌'}</td>
        <td style="padding:8px 12px;text-align:center;color:#9ca3af">${h.registrationYear ?? '—'}</td>
      </tr>`)
    .join('');

  const html = `
    <div style="background:#030712;color:#f9fafb;padding:24px;font-family:sans-serif;max-width:700px">
      <h2 style="color:#60a5fa;margin-bottom:4px">Legacy Google Finder — New Hits</h2>
      <p style="color:#6b7280;margin-top:0">${hits.length} domain(s) found at ${new Date().toUTCString()}</p>
      <table style="width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden">
        <thead style="background:#1f2937">
          <tr>
            <th style="padding:10px 12px;text-align:left;color:#9ca3af;font-size:12px">Domain</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">Score</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">MX</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">CNAME</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">start.*</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">Admin</th>
            <th style="padding:10px 12px;text-align:center;color:#9ca3af;font-size:12px">Reg. Year</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#4b5563;font-size:12px;margin-top:16px">
        Tier 1 (80+) = buy immediately. Tier 2 (60+) = investigate further.
      </p>
    </div>`;

  await getResend().emails.send({
    from,
    to,
    subject: `[Legacy Finder] ${hits.length} new hit${hits.length === 1 ? '' : 's'} found`,
    html,
  });
}
