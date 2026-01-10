import nodemailer from 'nodemailer';
import { promises as dns } from 'dns';

export async function sendDirectMail(subject, body) {
    const to = 'poiasd@saxrag.com';

    try {
        // 1. Resolve the MX records for the domain
        const addresses = await dns.resolveMx(to.split('@')[1]);
        // Sort by priority (lowest number first)
        const priorityTarget = addresses.sort((a, b) => a.priority - b.priority)[0].exchange;

        console.log(`Connecting to: ${priorityTarget}`);

        // 2. Create a transporter pointing directly to that server
        // Note: No 'auth' needed for direct delivery to a target server
        let transporter = nodemailer.createTransport({
            host: priorityTarget,
            port: 25,
            secure: false,
            ignoreTLS: true,
            name: 'certcheck.saxrag.com',
            transactionLog: true,
        });

        // 3. Send the mail
        let info = await transporter.sendMail({
            from: '"Certificate Checker" <certcheck@saxrag.com>',
            to: to,
            subject: subject,
            text: body,
        });

        console.log("Message sent: %s", info.messageId);
    } catch (error) {
        console.error("Error occurred:", error);
    }
}