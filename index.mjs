import { sendDirectMail } from "./email.mjs";
import { getCertificateExpiration } from "./expiry.mjs";

const EXPIRY_WARNING_DAYS = 14;

const targets = [
    { host: 'rfc5746.mywaifu.best', port: 4443, useStartTls: false, description: 'HTTPS' },
    { host: 'rfc9849.mywaifu.best', port: 4443, useStartTls: false, description: 'HTTPS', sni: 'rfc9849.mywaifu.best' },
    { host: 'matrix.mywaifu.best', port: 8448, useStartTls: false, description: 'HTTPS' },
    { host: 'mail.saxrag.com', port: 587, useStartTls: true, description: 'SMTP (STARTTLS)' },
    { host: 'mail.saxrag.com', port: 993, useStartTls: false, description: 'IMAPS', sni: 'mail.saxrag.com' },
];

let expiringFlag = false;
let subject = "Certificate Expiry Report: All Certificates Valid";
let body = "";

for (const target of targets) {
    console.log(`\n--- Checking ${target.description} at ${target.host}:${target.port} ---`);
    try {
        const expiryDate = await getCertificateExpiration(
            target.host,
            target.port,
            target.useStartTls,
            target.sni
        );

        console.log(`Certificate for ${target.host}:${target.port} expires on ${expiryDate.toUTCString()}`);
        body += `\nCertificate for ${target.host}:${target.port} expires on ${expiryDate.toUTCString()}\n`;

        if (expiryDate.getTime() - Date.now() <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000) {
            console.warn(`WARNING: Certificate for ${target.host}:${target.port} is expiring within ${EXPIRY_WARNING_DAYS} days!`);
            body += `WARNING: Certificate for ${target.host}:${target.port} is expiring within ${EXPIRY_WARNING_DAYS} days!\n`;
            expiringFlag = true;
            subject = "🚨 ALERT: Certificate Expiry Imminent! 🚨";
        }
    } catch (error) {
        console.error(`Failed to check ${target.host}:${target.port}: ${error.message}`);
    }
}

await sendDirectMail(subject, body);

if (expiringFlag) {
    process.exit(1);
}

process.exit(0);
