import express from 'express';
import 'dotenv/config';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || 'ovro.me';
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || 'ovro2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CF_HEADERS = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// Reserved subdomains that regular users cannot claim
const RESERVED_SUBDOMAINS = new Set([
  'admin', 'api', 'root', 'drive', 'offer', 'portal', 'mail', 'email', 'www',
  'ftp', 'ssh', 'ns1', 'ns2', 'ns3', 'cname', 'vpn', 'cloud', 'dev', 'test',
  'status', 'auth', 'login', 'signup', 'billing', 'docs', 'support', 'help',
  'system', 'cdn', 'static', 'assets', 'git', 'gitlab', 'github', 'ovro'
]);

function hashPin(pin, subdomain) {
  return crypto.createHash('sha256').update(`${subdomain}:${pin}:ovro-salt`).digest('hex');
}

// In-memory sessions (token -> { type: 'user' | 'admin', subdomain?: string })
const sessions = new Map();

function createSession(data) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...data, created: Date.now() });
  return token;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please login again.' });
  }
  req.session = sessions.get(token);
  next();
}

function adminMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token) || sessions.get(token).type !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  next();
}

// Helper: Fetch all Cloudflare DNS records
async function getCloudflareRecords() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?per_page=100`,
    { headers: CF_HEADERS }
  );
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare API failure');
  }
  return data.result || [];
}

// 1. Check Subdomain Availability
app.get('/api/check/:subdomain', async (req, res) => {
  try {
    const rawSub = (req.params.subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(rawSub)) {
      return res.status(400).json({
        available: false,
        reason: 'Invalid subdomain format. Use lowercase alphanumeric characters and hyphens only (2-32 chars).'
      });
    }

    if (RESERVED_SUBDOMAINS.has(rawSub)) {
      return res.json({ available: false, reason: 'This subdomain is reserved for core infrastructure.' });
    }

    const records = await getCloudflareRecords();
    const fullName = `${rawSub}.${DOMAIN}`;
    const claimRecordName = `_claim.${fullName}`;

    const exists = records.some(r => r.name === fullName || r.name === claimRecordName);
    if (exists) {
      return res.json({ available: false, reason: 'Already registered by another user.' });
    }

    return res.json({ available: true, subdomain: rawSub, fullDomain: fullName });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify availability', details: err.message });
  }
});

// 2. Claim Subdomain
app.post('/api/claim', async (req, res) => {
  try {
    const { subdomain, pin } = req.body;
    const cleanSub = (subdomain || '').toLowerCase().trim();

    if (!cleanSub || !/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(cleanSub)) {
      return res.status(400).json({ error: 'Invalid subdomain name.' });
    }

    if (RESERVED_SUBDOMAINS.has(cleanSub)) {
      return res.status(400).json({ error: 'Subdomain is reserved.' });
    }

    if (!pin || pin.length < 6) {
      return res.status(400).json({ error: 'PIN/Password must be at least 6 characters long.' });
    }

    const fullName = `${cleanSub}.${DOMAIN}`;
    const claimRecordName = `_claim.${fullName}`;
    const records = await getCloudflareRecords();

    if (records.some(r => r.name === fullName || r.name === claimRecordName)) {
      return res.status(400).json({ error: 'Subdomain is already taken.' });
    }

    const hashed = hashPin(pin, cleanSub);

    // Save claim proof as a TXT record in Cloudflare
    const claimRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`,
      {
        method: 'POST',
        headers: CF_HEADERS,
        body: JSON.stringify({
          type: 'TXT',
          name: claimRecordName,
          content: `v=ovro1;h=${hashed}`,
          ttl: 1,
          comment: `claim:${cleanSub}`
        }),
      }
    );

    const claimData = await claimRes.json();
    if (!claimData.success) {
      return res.status(400).json({ error: claimData.errors?.[0]?.message || 'Failed to claim subdomain' });
    }

    const token = createSession({ type: 'user', subdomain: cleanSub });
    return res.status(201).json({
      success: true,
      subdomain: cleanSub,
      fullDomain: fullName,
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Claim error', details: err.message });
  }
});

// 3. User Login to Subdomain
app.post('/api/login-subdomain', async (req, res) => {
  try {
    const { subdomain, pin } = req.body;
    const cleanSub = (subdomain || '').toLowerCase().trim();

    if (!cleanSub || !pin) {
      return res.status(400).json({ error: 'Subdomain and PIN are required.' });
    }

    const fullName = `${cleanSub}.${DOMAIN}`;
    const claimRecordName = `_claim.${fullName}`;
    const records = await getCloudflareRecords();

    const claimRec = records.find(r => r.type === 'TXT' && r.name === claimRecordName);
    if (!claimRec) {
      return res.status(404).json({ error: 'Subdomain claim record not found. Has it been registered?' });
    }

    const expectedHash = hashPin(pin, cleanSub);
    const content = claimRec.content.replace(/"/g, '');

    if (!content.includes(expectedHash)) {
      return res.status(401).json({ error: 'Invalid PIN or password.' });
    }

    const token = createSession({ type: 'user', subdomain: cleanSub });
    return res.json({ success: true, token, subdomain: cleanSub, fullDomain: fullName });
  } catch (err) {
    return res.status(500).json({ error: 'Login error', details: err.message });
  }
});

// 4. User: Get DNS Records for their subdomain
app.get('/api/user/records', authMiddleware, async (req, res) => {
  try {
    const { subdomain } = req.session;
    const fullName = `${subdomain}.${DOMAIN}`;
    const records = await getCloudflareRecords();

    // Filter only records that belong to this subdomain (exclude internal claim TXT record)
    const userRecords = records.filter(r => {
      if (r.name.startsWith('_claim.')) return false;
      return r.name === fullName || r.name.endsWith(`.${fullName}`);
    });

    return res.json({ subdomain, fullDomain: fullName, records: userRecords });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve records', details: err.message });
  }
});

// 5. User: Add DNS Record for their subdomain
app.post('/api/user/records', authMiddleware, async (req, res) => {
  try {
    const { subdomain } = req.session;
    const fullName = `${subdomain}.${DOMAIN}`;
    const { type, prefix, content, proxied = false } = req.body;

    const allowedTypes = ['A', 'CNAME', 'TXT'];
    if (!allowedTypes.includes(type?.toUpperCase())) {
      return res.status(400).json({ error: 'Only A, CNAME, and TXT records are permitted.' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content/IP is required.' });
    }

    // Determine target record name (e.g. "sub.ovro.me" or "api.sub.ovro.me")
    let recordName = fullName;
    const cleanPrefix = (prefix || '').trim().toLowerCase();
    if (cleanPrefix && cleanPrefix !== '@') {
      recordName = `${cleanPrefix}.${fullName}`;
    }

    // Validate IPv4 for A record
    if (type.toUpperCase() === 'A') {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(content.trim())) {
        return res.status(400).json({ error: 'Invalid IPv4 address format.' });
      }
    }

    const payload = {
      type: type.toUpperCase(),
      name: recordName,
      content: content.trim(),
      ttl: 1,
      proxied: type.toUpperCase() === 'A' || type.toUpperCase() === 'CNAME' ? Boolean(proxied) : false,
      comment: `user:${subdomain}`,
    };

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`,
      {
        method: 'POST',
        headers: CF_HEADERS,
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: data.errors?.[0]?.message || 'Cloudflare error' });
    }

    return res.status(201).json({ success: true, record: data.result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create record', details: err.message });
  }
});

// 6. User: Delete DNS Record
app.delete('/api/user/records/:id', authMiddleware, async (req, res) => {
  try {
    const { subdomain } = req.session;
    const fullName = `${subdomain}.${DOMAIN}`;
    const { id } = req.params;

    // Verify record ownership before deleting
    const records = await getCloudflareRecords();
    const target = records.find(r => r.id === id);

    if (!target) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    const isOwner = target.name === fullName || target.name.endsWith(`.${fullName}`);
    if (!isOwner || target.name.startsWith('_claim.')) {
      return res.status(403).json({ error: 'You do not have permission to delete this record.' });
    }

    const delRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${id}`,
      {
        method: 'DELETE',
        headers: CF_HEADERS,
      }
    );

    const data = await delRes.json();
    if (!data.success) {
      return res.status(400).json({ error: data.errors?.[0]?.message || 'Failed to delete record' });
    }

    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ error: 'Delete error', details: err.message });
  }
});

// 7. Admin: Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  const token = createSession({ type: 'admin' });
  return res.json({ success: true, token });
});

// 8. Admin: Get ALL records
app.get('/api/admin/records', adminMiddleware, async (req, res) => {
  try {
    const records = await getCloudflareRecords();
    return res.json({ success: true, domain: DOMAIN, records });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin records', details: err.message });
  }
});

// 9. Admin: Delete ANY record
app.delete('/api/admin/records/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const delRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${id}`,
      { method: 'DELETE', headers: CF_HEADERS }
    );
    const data = await delRes.json();
    if (!data.success) {
      return res.status(400).json({ error: data.errors?.[0]?.message || 'Failed to delete record' });
    }
    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ error: 'Admin delete error', details: err.message });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[ovro-dns-portal] Server listening at http://localhost:${PORT}`);
  });
}

export default app;
