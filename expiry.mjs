import tls from 'tls';
import net from 'net';

// Function to connect and return certificate expiration date
async function getCertificateExpiration(host, port, expiryWarningDays, useStartTls = false) {
    console.log(`Checking certificate for ${host}:${port} (STARTTLS: ${useStartTls ? 'Yes' : 'No'})`);

    return new Promise((resolve, reject) => {
        let socket;
        let tlsSocket;

        const connectOptions = {
            host: host,
            port: port,
            rejectUnauthorized: false // Set to true in production for proper validation
        };

        const handleTlsConnection = () => {
            const certificate = tlsSocket.getPeerCertificate(true);

            if (!certificate) {
                if (tlsSocket && !tlsSocket.destroyed) tlsSocket.end();
                return reject(new Error('No peer certificate found.'));
            }

            const endDate = new Date(certificate.valid_to);
            if (tlsSocket && !tlsSocket.destroyed) tlsSocket.end();
            resolve(endDate);
        };

        const handleError = (err) => {
            if (socket && !socket.destroyed) socket.destroy();
            if (tlsSocket && !tlsSocket.destroyed) tlsSocket.destroy();
            reject(err);
        };

        if (useStartTls) {
            socket = net.connect(connectOptions, () => {
                // For STARTTLS flow we keep the previous logic but only upgrade when appropriate
                let startTlsCommand = '';
                if (port === 25 || port === 587) { // SMTP
                    startTlsCommand = 'EHLO example.com\r\n';
                } else if (port === 143) { // IMAP
                    startTlsCommand = '1 STARTTLS\r\n';
                }

                socket.on('data', (data) => {
                    const buffer = data.toString();

                    if (startTlsCommand && (buffer.includes('Ready to start TLS') || buffer.includes('220 Go ahead with TLS') || buffer.includes('220 '))) {
                        tlsSocket = tls.connect({ socket: socket, servername: host }, handleTlsConnection);
                        tlsSocket.on('error', handleError);
                        socket.removeAllListeners('data');
                    } else if (startTlsCommand && (buffer.includes('220') || buffer.includes('250') || buffer.includes('OK'))) {
                        // send EHLO/STARTTLS if server shows readiness
                        socket.write(startTlsCommand);
                    }
                });

                socket.on('timeout', () => {
                    handleError(new Error('Socket timeout during STARTTLS negotiation.'));
                });
            });

            socket.on('error', handleError);
        } else {
            tlsSocket = tls.connect(connectOptions, handleTlsConnection);
            tlsSocket.on('error', handleError);
        }
    });
}

// --- Main execution ---
async function main() {
    const EXPIRY_WARNING_DAYS = 14;

    const targets = [
        // Example for direct T`LS (HTTPS)
        { host: 'rfc5746.mywaifu.best', port: 4443, useStartTls: false, description: 'HTTPS (Direct TLS)' },
        // { host: 'mail.saxrag.com', port: 587, useStartTls: true, description: 'SMTP (STARTTLS)' },
        // { host: 'mail.saxrag.com', port: 25, useStartTls: true, description: 'SMTP (STARTTLS)' },
        // Example for STARTTLS on SMTP (Submission port)
        // { host: 'smtp.gmail.com', port: 587, useStartTls: true, description: 'SMTP (STARTTLS)' },
        // Example for STARTTLS on IMAP
        // { host: 'imap.mail.yahoo.com', port: 143, useStartTls: true, description: 'IMAP (STARTTLS)' },
        // Replace with your actual domain for testing
        // { host: 'domain.com', port: 443, useStartTls: false, description: 'Your Domain (Direct TLS)' },
        // { host: 'domain.com', port: 587, useStartTls: true, description: 'Your Domain (STARTTLS)' },
    ];

    // Basic validation for the placeholder domain
    const placeholderUsed = targets.some(target => target.host === 'domain.com');
    if (placeholderUsed) {
        console.warn("WARNING: You are using the placeholder domain 'domain.com'. Please replace it with your actual domain for meaningful results.");
    }

    for (const target of targets) {
        console.log(`\n--- Checking ${target.description} at ${target.host}:${target.port} ---`);
        try {
            const expiryDate = await getCertificateExpiration(
                target.host,
                target.port,
                EXPIRY_WARNING_DAYS,
                target.useStartTls
            );

            console.log(`Certificate for ${target.host}:${target.port} expires on ${expiryDate.toUTCString()}`);
        } catch (error) {
            console.error(`Failed to check ${target.host}:${target.port}: ${error.message}`);
        }
    }
}

main();