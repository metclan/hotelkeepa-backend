import { ServerClient } from 'postmark';
const postmarkClient = new ServerClient(process.env.POSTMARK_SERVER_TOKEN || "");
export const sendEmail = async ({ recipient, subject, message }) => {
    // Simulate sending an email (replace with actual email sending logic)
    console.log(`Sending email to: ${recipient}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    // Simulate a delay for sending the email
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Email sent successfully!');
};
