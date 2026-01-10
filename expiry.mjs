import tls from 'tls';
import net from 'net';

// Function to connect and check certificate
async function checkCertificateExpiration(host, port, expiryWarningDays, useStartTls = false) {
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
            console.log(`TLS handshake complete for ${host}:${port}`);
            const certificate = tlsSocket.getPeerCertificate(true);

            if (!certificate) {
                console.warn('No peer certificate found.');
                tlsSocket.end();
                return reject(new Error('No peer certificate found.'));
            }

            const endDate = new Date(certificate.valid_to);
            const now = new Date();
            const timeDiff = endDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            console.log(`Certificate for ${host} is valid until: ${endDate.toUTCString()}`);
            console.log(`Days remaining: ${daysRemaining}`);

            if (daysRemaining < expiryWarningDays) {
                console.log('🚨 ALERT: Certificate is expiring soon!');
                console.log(`Certificate for ${host} expires in ${daysRemaining} days, which is less than ${expiryWarningDays} days.`);
                resolve({ host, port, expiresSoon: true, daysRemaining, useStartTls });
            } else {
                console.log(`Certificate for ${host} is valid for ${daysRemaining} more days.`);
                resolve({ host, port, expiresSoon: false, daysRemaining, useStartTls });
            }

            tlsSocket.end();
        };

        const handleError = (err) => {
            console.error(`Error connecting or during TLS handshake to ${host}:${port}:`, err.message);
            if (socket && !socket.destroyed) socket.destroy(); // Ensure socket is closed
            if (tlsSocket && !tlsSocket.destroyed) tlsSocket.destroy();
            reject(err);
        };

        if (useStartTls) {
            // For STARTTLS, first establish a plain TCP connection
            socket = net.connect(connectOptions, () => {
                console.log(`Connected to ${host}:${port} for STARTTLS`);

                // Common STARTTLS commands based on port
                let startTlsCommand = '';
                if (port === 25 || port === 587) { // SMTP
                    startTlsCommand = 'EHLO example.com\r\n'; // EHLO is good practice before STARTTLS
                } else if (port === 143) { // IMAP
                    startTlsCommand = '1 STARTTLS\r\n';
                } else {
                    console.warn(`WARNING: No specific STARTTLS command defined for port ${port}. Trying generic upgrade.`);
                    // For generic cases, you might just convert if the server immediately expects it
                    // Or you might need to manually send a command if the protocol is known
                }

                // Listen for server's ready response before sending STARTTLS command
                socket.on('data', (data) => {
                    let buffer = data.toString();
                    console.log(`Received: ${data.toString().trim()}`); // Log server response

                    // Basic checks for server readiness based on common protocols
                    if ((port === 25 || port === 587) && buffer.includes('220 mail.saxrag.com')) { // SMTP ready
                        socket.write(startTlsCommand);
                    } else if (port === 143 && buffer.includes('* OK ')) { // IMAP ready
                        socket.write(startTlsCommand);
                    } else if (buffer.includes('STARTTLS\r\n')){
                        socket.write('STARTTLS\r\n');
                    }

                    // Check if STARTTLS command was sent and server responded positively
                    // if (startTlsCommand && buffer.includes('220 Ready to start TLS') || buffer.includes('220 Go ahead with TLS')) {
                    if (startTlsCommand && buffer.includes('Ready to start TLS') || buffer.includes('220 Go ahead with TLS')) {
                        console.log('Server ready for TLS upgrade. Converting socket...');
                        tlsSocket = tls.connect({
                            socket: socket,
                            servername: 'mail.saxrag.com'
                        }, handleTlsConnection);
                        // tlsSocket = tls.convertNetSocket(socket, connectOptions, handleTlsConnection);
                        tlsSocket.on('error', handleError);
                        // Remove the data listener from the original socket
                        socket.removeAllListeners('data');
                    }
                });

                socket.on('timeout', () => {
                    handleError(new Error('Socket timeout during STARTTLS negotiation.'));
                });
            });

            socket.on('error', handleError);
            socket.on('close', () => {
                if (!tlsSocket || tlsSocket.destroyed) {
                    console.log(`Plain connection to ${host}:${port} closed.`);
                }
            });

        } else {
            // Direct TLS connection
            tlsSocket = tls.connect(connectOptions, handleTlsConnection);
            tlsSocket.on('error', handleError);
            tlsSocket.on('close', () => {
                console.log(`Direct TLS connection to ${host}:${port} closed.`);
            });
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
            const result = await checkCertificateExpiration(
                target.host,
                target.port,
                EXPIRY_WARNING_DAYS,
                target.useStartTls
            );

            if (result.expiresSoon) {
                console.log(`!!! Action needed for ${result.host}:${result.port}: Certificate needs attention.`);
            } else {
                console.log(`Certificate for ${result.host}:${result.port} is OK.`);
            }
        } catch (error) {
            console.error(`Failed to check ${target.host}:${target.port}: ${error.message}`);
        }
    }
}

main();