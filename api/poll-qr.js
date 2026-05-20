const QRCode = require('qrcode');

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, group } = req.query;
  if (!id && !group) {
    return res.status(400).json({ error: 'Question ID or group ID is required' });
  }

  const base = getBaseUrl(req);
  const url = group
    ? `${base}/poll?group=${group}`
    : `${base}/poll?id=${id}`;

  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: 300,
      margin: 2,
      color: { dark: '#0E0E0E', light: '#FFFFFF' },
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(svg);
  } catch (err) {
    console.error('QR generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
};
