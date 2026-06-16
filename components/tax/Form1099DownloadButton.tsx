"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { Form1099Document, type Form1099Data } from "./Form1099Document";

/**
 * Client-only 1099-NEC PDF link. Loaded via next/dynamic with ssr:false in the
 * parent so @react-pdf/renderer never runs during server rendering.
 */
export default function Form1099DownloadButton({ data }: { data: Form1099Data }) {
  const safeName = (data.recipient.legal_name || data.recipient.name || "contractor")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return (
    <PDFDownloadLink
      document={<Form1099Document {...data} />}
      fileName={`1099-NEC-${safeName}-${data.year}.pdf`}
      className="btn-secondary"
    >
      {({ loading }) => (
        <>
          <Download className="h-4 w-4" />
          {loading ? "…" : "1099-NEC"}
        </>
      )}
    </PDFDownloadLink>
  );
}
