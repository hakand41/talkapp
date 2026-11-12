// Zero-Dependency X.509 v3 Self-Signed SSL Certificate Generator for TalkApp HTTPS / WSS
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let temp = len;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function asn1Tag(tag, content) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

function asn1Seq(...items) {
  return asn1Tag(0x30, Buffer.concat(items));
}

function asn1Set(...items) {
  return asn1Tag(0x31, Buffer.concat(items));
}

function asn1Int(buf) {
  let b = Buffer.isBuffer(buf) ? buf : Buffer.from([buf]);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return asn1Tag(0x02, b);
}

function asn1BitString(buf) {
  return asn1Tag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function asn1OctetString(buf) {
  return asn1Tag(0x04, buf);
}

function asn1Null() {
  return Buffer.from([0x05, 0x00]);
}

function asn1Oid(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val === 0) {
      bytes.push(0);
    } else {
      const sub = [];
      while (val > 0) {
        sub.unshift(val & 0x7f);
        val >>= 7;
      }
      for (let j = 0; j < sub.length - 1; j++) sub[j] |= 0x80;
      bytes.push(...sub);
    }
  }
  return asn1Tag(0x06, Buffer.from(bytes));
}

function asn1Utf8(str) {
  return asn1Tag(0x0c, Buffer.from(str, 'utf8'));
}

function asn1UtcTime(date) {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return asn1Tag(0x17, Buffer.from(`${yy}${mm}${dd}${hh}${min}${ss}Z`, 'ascii'));
}

function getLocalIPv4Addresses() {
  const ips = new Set(['127.0.0.1']);
  const envIp = process.env.PUBLIC_IP || process.env.SERVER_IP || process.env.EXTERNAL_IP;
  if (envIp) ips.add(envIp);
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const net of list || []) {
        if (net.family === 'IPv4' && net.address) {
          ips.add(net.address);
        }
      }
    }
  } catch (e) {}
  return Array.from(ips);
}

function generateSelfSignedCert(commonName = (process.env.PUBLIC_IP || 'localhost')) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048
  });

  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  // sha256WithRSAEncryption (1.2.840.113549.1.1.11)
  const sigAlg = asn1Seq(asn1Oid('1.2.840.113549.1.1.11'), asn1Null());

  // Version v3 ([0] EXPLICIT INTEGER 2)
  const version = asn1Tag(0xa0, asn1Int(2));

  // Serial Number (16 random positive bytes)
  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] &= 0x7f;
  if (serialBytes[0] === 0) serialBytes[0] = 1;
  const serial = asn1Int(serialBytes);

  // Subject & Issuer Name (CN=commonName, O=TalkApp)
  const rdnCn = asn1Set(asn1Seq(asn1Oid('2.5.4.3'), asn1Utf8(commonName)));
  const rdnOrg = asn1Set(asn1Seq(asn1Oid('2.5.4.10'), asn1Utf8('TalkApp')));
  const name = asn1Seq(rdnOrg, rdnCn);

  // Validity (yesterday to +10 years)
  const notBefore = new Date(Date.now() - 86400 * 1000);
  const notAfter = new Date(Date.now() + 3650 * 86400 * 1000);
  const validity = asn1Seq(asn1UtcTime(notBefore), asn1UtcTime(notAfter));

  // X.509 v3 Extensions: Subject Alternative Name (localhost + PUBLIC_IP + all LAN IPs)
  const sanEntries = [
    asn1Tag(0x82, Buffer.from('localhost', 'ascii')) // dNSName [2]
  ];
  if (process.env.SERVER_DOMAIN) {
    sanEntries.push(asn1Tag(0x82, Buffer.from(process.env.SERVER_DOMAIN, 'ascii')));
  }
  for (const ip of getLocalIPv4Addresses()) {
    const octets = ip.split('.').map(n => parseInt(n, 10));
    if (octets.length === 4 && octets.every(n => n >= 0 && n <= 255)) {
      sanEntries.push(asn1Tag(0x87, Buffer.from(octets))); // iPAddress [7]
    }
  }
  const sanExt = asn1Seq(
    asn1Oid('2.5.29.17'),
    asn1OctetString(asn1Seq(...sanEntries))
  );

  // Basic Constraints (CA:FALSE)
  const bcExt = asn1Seq(
    asn1Oid('2.5.29.19'),
    asn1OctetString(asn1Seq())
  );

  const extensions = asn1Tag(0xa3, asn1Seq(bcExt, sanExt));

  const tbs = asn1Seq(
    version,
    serial,
    sigAlg,
    name,
    validity,
    name,
    spkiDer,
    extensions
  );

  const signature = crypto.sign('RSA-SHA256', tbs, privateKey);
  const certDer = asn1Seq(tbs, sigAlg, asn1BitString(signature));
  const certB64 = certDer.toString('base64').match(/.{1,64}/g).join('\n');
  const certPem = `-----BEGIN CERTIFICATE-----\n${certB64}\n-----END CERTIFICATE-----\n`;

  return { cert: certPem, key: privPem, ips: getLocalIPv4Addresses() };
}

function ensureSslCertificates(sslDir) {
  const certPath = path.join(sslDir, 'cert.pem');
  const keyPath = path.join(sslDir, 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8'),
      certPath,
      keyPath,
      generated: false,
      ips: getLocalIPv4Addresses()
    };
  }

  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  const { cert, key, ips } = generateSelfSignedCert();
  fs.writeFileSync(certPath, cert, 'utf8');
  fs.writeFileSync(keyPath, key, 'utf8');

  return {
    cert,
    key,
    certPath,
    keyPath,
    generated: true,
    ips
  };
}

module.exports = {
  ensureSslCertificates,
  getLocalIPv4Addresses
};
