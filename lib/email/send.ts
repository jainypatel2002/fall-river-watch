import { Resend } from "resend";
import { prettyCategory } from "@/lib/utils/format";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
    to: string;
    incidentId: string;
    category: string;
    title: string | null;
    description: string;
    distanceMiles: number;
}

export async function sendIncidentEmail({
    to,
    incidentId,
    category,
    title,
    description,
    distanceMiles
}: SendEmailOptions) {
    if (!process.env.RESEND_API_KEY) {
        console.warn("Skipping email alert: RESEND_API_KEY missing.");
        return;
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const fromEmail = process.env.EMAIL_FROM || "alerts@fallriveralert.com";
    const displayCategory = prettyCategory(category);
    const subject = `New Alert: ${title || displayCategory} nearby`;

    try {
        await resend.emails.send({
            from: fromEmail,
            to,
            subject,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #0f172a;">New ${displayCategory} Reported</h2>
          <p><strong>Distance:</strong> ~${distanceMiles.toFixed(1)} miles from your configured location.</p>
          ${title ? `<p><strong>Title:</strong> ${title}</p>` : ""}
          <p><strong>Details:</strong></p>
          <blockquote style="border-left: 4px solid #cbd5e1; margin-left: 0; padding-left: 16px; color: #334155;">
            ${description}
          </blockquote>
          <div style="margin-top: 32px;">
            <a href="${appUrl}/?reportId=${incidentId}" 
               style="background-color: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
               View on Map
            </a>
          </div>
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <p style="font-size: 12px; color: #64748b;">
            You received this due to your notification preferences.<br/>
            <a href="${appUrl}/settings/notifications" style="color: #2563eb;">Manage your preferences</a>
          </p>
        </div>
      `
        });
    } catch (error) {
        console.error("[Email Error]", error);
    }
}
