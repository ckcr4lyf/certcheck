import tls from 'tls';
import net from 'net';

// Function to connect and return certificate expiration date
export async function getCertificateExpiration(host, port, useStartTls = false) {
    console.log(`Checking certificate for ${host}:${port} (STARTTLS: ${useStartTls ? 'Yes' : 'No'})`);

    return new Promise((resolve, reject) => {
        /**
         * @type {net.Socket}
         */
        let socket;

        /**
         * @type {tls.TLSSocket}
         */
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
                let handshakeCommand = `EHLO mail.example.com\r\n`;
                let handshakeCompleted = false;

                socket.on('data', (data) => {
                    const buffer = data.toString();

                    if (buffer.includes('220') && !handshakeCompleted) {
                        // Initial SMTP hello
                        socket.write(handshakeCommand);
                        handshakeCompleted = true;
                        return;
                    }

                    if (buffer.includes('250-STARTTLS') && handshakeCompleted) {
                        // Server supports STARTTLS
                        const startTlsCommand = `STARTTLS\r\n`;
                        socket.write(startTlsCommand);
                    }

                    if (buffer.includes('220') && handshakeCompleted) {
                        // Server is ready for TLS    
                        socket.removeAllListeners('data');
                        tlsSocket = tls.connect({ socket: socket, servername: host }, handleTlsConnection);
                        tlsSocket.on('error', handleError);
                        return;
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
