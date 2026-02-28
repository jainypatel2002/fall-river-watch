import { NextResponse } from "next/server";

export async function GET() {
    const emailConfigured = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
    const pushConfigured = !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    return NextResponse.json({
        emailConfigured,
        pushConfigured
    });
}
