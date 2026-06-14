"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

export interface InvoicePdfData {
  org: { name: string; email: string | null };
  client: { name: string; email: string | null; address: string | null };
  invoice: {
    invoice_number: string;
    due_date: string;
    subtotal_cents: number;
    tax_cents: number;
    grand_total_cents: number;
  };
  items: { title: string; description: string | null; total_cents: number }[];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1f2937" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "2px solid #e5e7eb",
    paddingBottom: 15,
    marginBottom: 20,
  },
  company: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  titleBlock: { textAlign: "right" },
  invoiceTitle: { fontSize: 20, fontWeight: "bold", color: "#1a56db" },
  billTo: { marginBottom: 25 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#6b7280",
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    padding: 6,
    fontWeight: "bold",
  },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #f3f4f6", padding: 8 },
  colDesc: { width: "65%" },
  colAmount: { width: "35%", textAlign: "right" },
  totalsBlock: { flexDirection: "row", justifyContent: "flex-end", marginTop: 15 },
  totalsTable: { width: "40%", borderTop: "1px solid #e5e7eb", paddingTop: 8 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#111827",
    borderTop: "1px solid #e5e7eb",
    paddingTop: 6,
    marginTop: 4,
  },
  payNote: {
    marginTop: 30,
    backgroundColor: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: 12,
    fontSize: 9,
    color: "#475569",
  },
});

export function InvoicePdfDocument({ org, client, invoice, items }: InvoicePdfData) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>{org.name || "Your Business"}</Text>
            {org.email ? <Text>{org.email}</Text> : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text>Invoice #: {invoice.invoice_number}</Text>
            <Text>Due: {day(invoice.due_date)}</Text>
          </View>
        </View>

        <View style={s.billTo}>
          <Text style={s.sectionTitle}>Bill To</Text>
          <Text style={{ fontWeight: "bold", color: "#111827" }}>{client.name}</Text>
          {client.address ? <Text>{client.address}</Text> : null}
          {client.email ? <Text>{client.email}</Text> : null}
        </View>

        <View>
          <View style={s.tableHeader}>
            <Text style={s.colDesc}>Line Item</Text>
            <Text style={s.colAmount}>Amount</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.colDesc}>
                <Text style={{ fontWeight: "bold" }}>{item.title}</Text>
                {item.description ? (
                  <Text style={{ color: "#6b7280", fontSize: 8 }}>{item.description}</Text>
                ) : null}
              </View>
              <Text style={s.colAmount}>{money(item.total_cents)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalsBlock}>
          <View style={s.totalsTable}>
            <View style={s.totalsRow}>
              <Text>Subtotal</Text>
              <Text>{money(invoice.subtotal_cents)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text>Tax</Text>
              <Text>{money(invoice.tax_cents)}</Text>
            </View>
            <View style={[s.totalsRow, s.grandTotal]}>
              <Text>Grand Total</Text>
              <Text>{money(invoice.grand_total_cents)}</Text>
            </View>
          </View>
        </View>

        <View style={s.payNote}>
          <Text>
            Payment instructions will be provided via a secure online payment
            link. Please contact {org.email || "us"} with any billing questions.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
