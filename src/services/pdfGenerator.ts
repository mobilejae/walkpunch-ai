import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { CapturedDefect } from '../store/inspectionStore';

function escapeHtml(text?: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_');
  return cleaned || 'Inspection_Report';
}

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = cleaned.length;
  let padding = 0;
  if (cleaned.endsWith('==')) padding = 2;
  else if (cleaned.endsWith('=')) padding = 1;

  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = chars.indexOf(cleaned.charAt(i));
    const enc2 = chars.indexOf(cleaned.charAt(i + 1));
    const enc3 = chars.indexOf(cleaned.charAt(i + 2));
    const enc4 = chars.indexOf(cleaned.charAt(i + 3));

    const triplet = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);

    if (byteIndex < byteLength) bytes[byteIndex++] = (triplet >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (triplet >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = triplet & 0xff;
  }
  return bytes;
}

function getSeverityColor(severity?: string): string {
  switch (severity) {
    case 'Critical':
      return '#DC2626';
    case 'High':
      return '#EA580C';
    case 'Medium':
      return '#CA8A04';
    default:
      return '#16A34A';
  }
}

async function buildReportHtml(
  propertyName: string,
  inspectorName: string,
  defects: CapturedDefect[]
): Promise<string> {
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const openCount = defects.filter((d) => !d.resolved).length;
  const resolvedCount = defects.filter((d) => d.resolved).length;
  const criticalCount = defects.filter((d) => d.aiData?.severity === 'Critical').length;
  const highCount = defects.filter((d) => d.aiData?.severity === 'High').length;

  const cardsHtmlPromises = defects.map(async (item, index) => {
    let imgDataUri = '';
    try {
      const manipulated = await manipulateAsync(
        item.photoUri,
        [{ resize: { width: 500 } }],
        { compress: 0.6, format: SaveFormat.JPEG, base64: true }
      );
      if (manipulated.base64) {
        imgDataUri = `data:image/jpeg;base64,${manipulated.base64}`;
      }
    } catch (e) {
      console.warn('[WalkPunch PDF] Could not encode image for item:', item.id);
    }

    const severity = item.aiData?.severity || 'Medium';
    const badgeColor = getSeverityColor(severity);
    const location = escapeHtml(item.aiData?.location || 'UNASSIGNED AREA');
    const title = escapeHtml(item.aiData?.defectTitle || 'Logged Punch Item');
    const description = escapeHtml(
      item.aiData?.description || 'No description provided.'
    );
    const action = escapeHtml(
      item.aiData?.recommendedAction || 'Review and repair as needed.'
    );
    const itemNum = defects.length - index;
    const isResolved = Boolean(item.resolved);

    return `
      <div class="defect-card ${isResolved ? 'card-resolved' : ''}">
        <div class="card-left">
          ${
            imgDataUri
              ? `<img src="${imgDataUri}" class="defect-photo" />`
              : `<div class="no-photo">No Photo</div>`
          }
        </div>
        <div class="card-right">
          <div class="card-header">
            <div>
              <span class="item-number">#${itemNum}</span>
              <span class="location-tag">${location}</span>
              <span class="timestamp">${escapeHtml(item.timestamp)}</span>
            </div>
            <div class="badge-group">
              <span class="status-badge ${isResolved ? 'status-resolved' : 'status-open'}">
                ${isResolved ? '✓ RESOLVED' : 'OPEN'}
              </span>
              <span class="severity-badge" style="background-color: ${badgeColor};">
                ${severity.toUpperCase()}
              </span>
            </div>
          </div>
          <div class="defect-title">${title}</div>
          <div class="defect-desc">${description}</div>
          <div class="action-box">
            <strong>Recommended Action:</strong> ${action}
            ${
              isResolved && item.resolvedAt
                ? `<div class="resolved-note">Signed off &amp; verified on ${escapeHtml(item.resolvedAt)}</div>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  });

  const cardsHtml = (await Promise.all(cardsHtmlPromises)).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(propertyName)}</title>
        <style>
          @page {
            margin: 14mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #FFFFFF;
          }
          .header {
            background-color: #0F172A;
            color: #FFFFFF;
            padding: 22px 24px;
            border-radius: 10px;
            margin-bottom: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .brand-badge {
            color: #38BDF8;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .report-title {
            font-size: 22px;
            font-weight: 900;
            margin: 0 0 4px 0;
          }
          .property-subtitle {
            color: #CBD5E1;
            font-size: 14px;
            font-weight: 600;
          }
          .meta-right {
            text-align: right;
            font-size: 12px;
            color: #E2E8F0;
            line-height: 1.6;
          }
          .summary-bar {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 20px;
          }
          .stat-box {
            flex: 1;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 10px 12px;
            text-align: center;
          }
          .stat-count {
            font-size: 18px;
            font-weight: 900;
          }
          .stat-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .defect-card {
            display: flex;
            border: 1px solid #CBD5E1;
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 14px;
            background-color: #FFFFFF;
            page-break-inside: avoid;
          }
          .card-resolved {
            background-color: #F8FAFC;
            border-color: #86EFAC;
          }
          .card-left {
            width: 145px;
            margin-right: 16px;
            flex-shrink: 0;
          }
          .defect-photo {
            width: 145px;
            height: 145px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #E2E8F0;
          }
          .no-photo {
            width: 145px;
            height: 145px;
            background-color: #F1F5F9;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94A3B8;
            font-size: 12px;
          }
          .card-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          }
          .item-number {
            font-weight: 900;
            color: #0284C7;
            font-size: 13px;
            margin-right: 8px;
          }
          .location-tag {
            background-color: #E0F2FE;
            color: #0369A1;
            font-size: 11px;
            font-weight: 800;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            margin-right: 8px;
          }
          .timestamp {
            color: #94A3B8;
            font-size: 11px;
          }
          .badge-group {
            display: flex;
            gap: 6px;
            align-items: center;
          }
          .status-badge {
            font-size: 10px;
            font-weight: 800;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .status-open {
            background-color: #FEF3C7;
            color: #B45309;
          }
          .status-resolved {
            background-color: #DCFCE7;
            color: #15803D;
          }
          .severity-badge {
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 800;
            padding: 4px 9px;
            border-radius: 4px;
          }
          .defect-title {
            font-size: 16px;
            font-weight: 800;
            color: #0F172A;
            margin-bottom: 6px;
          }
          .defect-desc {
            font-size: 13px;
            color: #334155;
            line-height: 1.5;
            margin-bottom: 8px;
          }
          .action-box {
            background-color: #F8FAFC;
            border-left: 3px solid #0284C7;
            padding: 8px 10px;
            font-size: 12px;
            color: #1E293B;
            border-radius: 4px;
          }
          .resolved-note {
            margin-top: 4px;
            color: #15803D;
            font-weight: 700;
            font-size: 11px;
          }
          .footer {
            margin-top: 24px;
            text-align: center;
            font-size: 11px;
            color: #94A3B8;
            border-top: 1px solid #E2E8F0;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-badge">WalkPunch AI • Field Inspection Report</div>
            <div class="report-title">${escapeHtml(propertyName)}</div>
            <div class="property-subtitle">Executive Punch List &amp; Trade Sign-Off Summary</div>
          </div>
          <div class="meta-right">
            <div><strong>Inspector:</strong> ${escapeHtml(inspectorName)}</div>
            <div><strong>Date:</strong> ${reportDate}</div>
            <div><strong>Total Items:</strong> ${defects.length}</div>
          </div>
        </div>

        <div class="summary-bar">
          <div class="stat-box">
            <div class="stat-count" style="color: #0F172A;">${defects.length}</div>
            <div class="stat-label">Total Logged</div>
          </div>
          <div class="stat-box">
            <div class="stat-count" style="color: #D97706;">${openCount}</div>
            <div class="stat-label">Open Items</div>
          </div>
          <div class="stat-box">
            <div class="stat-count" style="color: #16A34A;">${resolvedCount}</div>
            <div class="stat-label">Resolved</div>
          </div>
          <div class="stat-box">
            <div class="stat-count" style="color: #DC2626;">${criticalCount}</div>
            <div class="stat-label">Critical</div>
          </div>
          <div class="stat-box">
            <div class="stat-count" style="color: #EA580C;">${highCount}</div>
            <div class="stat-label">High</div>
          </div>
        </div>

        ${cardsHtml}

        <div class="footer">
          Generated by WalkPunch AI • Multimodal Property Inspection System • ${reportDate}
        </div>
      </body>
    </html>
  `;
}

export async function previewPdfReport(
  propertyName: string,
  inspectorName: string,
  defects: CapturedDefect[]
): Promise<void> {
  const html = await buildReportHtml(propertyName, inspectorName, defects);
  await Print.printAsync({ html });
}

export async function savePdfToDevice(
  propertyName: string,
  inspectorName: string,
  defects: CapturedDefect[]
): Promise<string | null> {
  const html = await buildReportHtml(propertyName, inspectorName, defects);
  const { base64 } = await Print.printToFileAsync({ html, base64: true });

  if (!base64) {
    throw new Error('Could not encode PDF data.');
  }

  const fileName = `${sanitizeFileName(propertyName)}.pdf`;

  if (Platform.OS === 'android') {
    const SAF = LegacyFileSystem.StorageAccessFramework;
    const permissions = await SAF.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return null;
    }

    const fileUri = await SAF.createFileAsync(
      permissions.directoryUri,
      fileName,
      'application/pdf'
    );

    await LegacyFileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });

    console.log('[WalkPunch PDF] Saved directly to device folder:', fileUri);
    return fileName;
  } else {
    await sharePdfReport(propertyName, inspectorName, defects);
    return fileName;
  }
}

export async function sharePdfReport(
  propertyName: string,
  inspectorName: string,
  defects: CapturedDefect[]
): Promise<void> {
  const html = await buildReportHtml(propertyName, inspectorName, defects);
  const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });

  let shareUri = uri;
  if (base64) {
    try {
      const fileName = `${sanitizeFileName(propertyName)}.pdf`;
      const namedFile = new File(Paths.cache, fileName);

      if (namedFile.exists) {
        await namedFile.delete();
      }
      await namedFile.create();
      const pdfBytes = base64ToBytes(base64);
      await namedFile.write(pdfBytes);

      shareUri = namedFile.uri;
    } catch (err) {
      console.warn('[WalkPunch PDF] Could not write named PDF, falling back to temp URI:', err);
    }
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: `${propertyName} - Inspection Report`,
      UTI: 'com.adobe.pdf',
    });
  }
}