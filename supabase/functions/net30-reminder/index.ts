import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // Allow OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // 1. Enforce auth check or token validation to prevent unauthorized execution
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized request token' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing config keys in environment variables" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 2. Initialize Supabase Client with service key (to read views across all rows for automation)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 3. Fetch overdue invoices from calculated ledger view
    const { data: overdueInvoices, error } = await supabase
      .from("invoice_ledger")
      .select("*")
      .eq("status", "sent")
      .lt("due_date", new Date().toISOString());

    if (error) throw error;
    if (!overdueInvoices || overdueInvoices.length === 0) {
      return new Response(JSON.stringify({ message: "No overdue invoices found." }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const processedEmails = [];

    // 4. Loop through and send notifications
    for (const invoice of overdueInvoices) {
      // Fetch LLC owner profile to get business name & bank details for email
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name, email")
        .eq("id", invoice.user_id)
        .single();

      if (!profile || !invoice.client_email) continue;

      const formattedTotal = (invoice.grand_total_cents / 100).toFixed(2);
      const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 30px; border-radius: 8px;">
          <h2 style="color: #ef4444; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; margin-top: 0;">Payment Overdue Notice</h2>
          <p>Dear ${invoice.client_name},</p>
          <p>This is a formal reminder that invoice <strong>#${invoice.invoice_number}</strong> issued by <strong>${profile.business_name}</strong> is currently past due.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Invoice Reference:</td>
              <td style="padding: 8px 0; text-align: right;">${invoice.invoice_number}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Original Due Date:</td>
              <td style="padding: 8px 0; text-align: right;">${new Date(invoice.due_date).toLocaleDateString()}</td>
            </tr>
            <tr style="border-bottom: 2px solid #d1d5db;">
              <td style="padding: 8px 0; font-weight: bold; color: #111827; font-size: 16px;">Outstanding Balance:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #ef4444; font-size: 16px;">$${formattedTotal}</td>
            </tr>
          </table>

          <p>Please log into your treasury system and process a direct B2B ACH "Push" wire transfer matching the outstanding amount. Banking credentials (routing and account numbers) are details in the invoice PDF footer.</p>
          <p>If payment has already been initiated, please reply with the ACH reference number so we can reconcile our ledger.</p>
          <br/>
          <p style="margin-bottom: 0;">Best regards,</p>
          <p style="font-weight: bold; margin-top: 5px;">${profile.business_name}</p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${profile.email}</p>
        </div>
      `;

      // Trigger Resend API call
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${profile.business_name} Billing <billing@yourdomain.com>`,
          to: [invoice.client_email],
          subject: `Urgent: Overdue Payment Notice - Invoice #${invoice.invoice_number}`,
          html: emailBody,
        }),
      });

      if (res.ok) {
        // Mark invoice as overdue in the database
        await supabase
          .from("invoices")
          .update({ status: "overdue" })
          .eq("id", invoice.invoice_id);

        processedEmails.push(invoice.invoice_number);
      } else {
        const errorText = await res.text();
        console.error(`Failed to send email for invoice ${invoice.invoice_number}:`, errorText);
      }
    }

    return new Response(JSON.stringify({ success: true, emailed: processedEmails }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
