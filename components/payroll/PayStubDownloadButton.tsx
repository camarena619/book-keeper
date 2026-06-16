"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { PayStubDocument, type PayStubData } from "./PayStubDocument";

/** Client-only pay-stub PDF link (loaded via next/dynamic ssr:false in parent). */
export default function PayStubDownloadButton({ data }: { data: PayStubData }) {
  const safeName = (data.employee.name || "employee")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return (
    <PDFDownloadLink
      document={<PayStubDocument {...data} />}
      fileName={`paystub-${safeName}-${data.period.pay_date}.pdf`}
      className="btn-secondary"
    >
      {({ loading }) => (
        <>
          <Download className="h-4 w-4" />
          {loading ? "…" : "Pay stub"}
        </>
      )}
    </PDFDownloadLink>
  );
}
