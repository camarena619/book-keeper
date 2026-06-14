"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { InvoicePdfDocument, type InvoicePdfData } from "./InvoicePdfDocument";

/**
 * Client-only PDF download link. Loaded via next/dynamic with ssr:false in the
 * parent so @react-pdf/renderer never runs during server rendering.
 */
export default function PdfDownloadButton({ data }: { data: InvoicePdfData }) {
  return (
    <PDFDownloadLink
      document={<InvoicePdfDocument {...data} />}
      fileName={`${data.invoice.invoice_number}.pdf`}
      className="inline-flex items-center gap-1 rounded p-1.5 text-slate-600 hover:bg-slate-100"
    >
      {({ loading }) => (
        <>
          <Download className="h-4 w-4" />
          <span className="text-xs">{loading ? "…" : "PDF"}</span>
        </>
      )}
    </PDFDownloadLink>
  );
}
