"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface PayStubAmounts {
  gross_cents: number;
  federal_tax_cents: number;
  state_tax_cents: number;
  social_security_cents: number;
  medicare_cents: number;
  other_deductions_cents: number;
  net_cents: number;
}

export interface PayStubData {
  employer: { name: string; address: string | null };
  employee: { name: string; address: string | null };
  period: { start: string; end: string; pay_date: string };
  current: PayStubAmounts;
  ytd: PayStubAmounts;
}

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
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
    paddingBottom: 14,
    marginBottom: 16,
  },
  company: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  title: { fontSize: 16, fontWeight: "bold", color: "#1a56db" },
  meta: { textAlign: "right", fontSize: 9, color: "#6b7280" },
  parties: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  label: { fontSize: 8, textTransform: "uppercase", color: "#6b7280", marginBottom: 3 },
  name: { fontWeight: "bold", color: "#111827" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    padding: 6,
    fontWeight: "bold",
    fontSize: 9,
  },
  row: { flexDirection: "row", padding: 6, borderBottom: "1px solid #f3f4f6" },
  c1: { width: "50%" },
  c2: { width: "25%", textAlign: "right" },
  c3: { width: "25%", textAlign: "right" },
  sectionTitle: { marginTop: 14, marginBottom: 2, fontSize: 10, fontWeight: "bold", color: "#374151" },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    backgroundColor: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: 6,
    padding: 12,
  },
  netLabel: { fontSize: 12, fontWeight: "bold", color: "#065f46" },
  netVal: { fontSize: 14, fontWeight: "bold", color: "#065f46" },
  note: { marginTop: 18, fontSize: 8, color: "#9ca3af" },
});

function Line({ label, cur, ytd }: { label: string; cur: number; ytd: number }) {
  return (
    <View style={s.row}>
      <Text style={s.c1}>{label}</Text>
      <Text style={s.c2}>{money(cur)}</Text>
      <Text style={s.c3}>{money(ytd)}</Text>
    </View>
  );
}

export function PayStubDocument({ employer, employee, period, current, ytd }: PayStubData) {
  const totalDeductionsCur =
    current.federal_tax_cents +
    current.state_tax_cents +
    current.social_security_cents +
    current.medicare_cents +
    current.other_deductions_cents;
  const totalDeductionsYtd =
    ytd.federal_tax_cents +
    ytd.state_tax_cents +
    ytd.social_security_cents +
    ytd.medicare_cents +
    ytd.other_deductions_cents;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>{employer.name || "Your Business"}</Text>
            {employer.address ? <Text style={{ fontSize: 9 }}>{employer.address}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>PAY STATEMENT</Text>
            <Text style={s.meta}>Pay date: {day(period.pay_date)}</Text>
            <Text style={s.meta}>
              Period: {day(period.start)} – {day(period.end)}
            </Text>
          </View>
        </View>

        <View style={s.parties}>
          <View>
            <Text style={s.label}>Employee</Text>
            <Text style={s.name}>{employee.name}</Text>
            {employee.address ? <Text>{employee.address}</Text> : null}
          </View>
        </View>

        <View style={s.tableHeader}>
          <Text style={s.c1}>Earnings</Text>
          <Text style={s.c2}>Current</Text>
          <Text style={s.c3}>YTD</Text>
        </View>
        <Line label="Gross pay" cur={current.gross_cents} ytd={ytd.gross_cents} />

        <Text style={s.sectionTitle}>Deductions</Text>
        <View style={s.tableHeader}>
          <Text style={s.c1}>Description</Text>
          <Text style={s.c2}>Current</Text>
          <Text style={s.c3}>YTD</Text>
        </View>
        <Line label="Federal income tax" cur={current.federal_tax_cents} ytd={ytd.federal_tax_cents} />
        <Line label="State income tax" cur={current.state_tax_cents} ytd={ytd.state_tax_cents} />
        <Line label="Social Security (6.2%)" cur={current.social_security_cents} ytd={ytd.social_security_cents} />
        <Line label="Medicare (1.45%)" cur={current.medicare_cents} ytd={ytd.medicare_cents} />
        {current.other_deductions_cents > 0 || ytd.other_deductions_cents > 0 ? (
          <Line label="Other" cur={current.other_deductions_cents} ytd={ytd.other_deductions_cents} />
        ) : null}
        <View style={[s.row, { fontWeight: "bold" }]}>
          <Text style={s.c1}>Total deductions</Text>
          <Text style={s.c2}>{money(totalDeductionsCur)}</Text>
          <Text style={s.c3}>{money(totalDeductionsYtd)}</Text>
        </View>

        <View style={s.netRow}>
          <Text style={s.netLabel}>Net pay</Text>
          <Text style={s.netVal}>{money(current.net_cents)}</Text>
        </View>

        <Text style={s.note}>
          Income-tax withholding shown is an estimate based on a configured rate, not
          the IRS withholding tables. This statement is for recordkeeping; it does not
          constitute tax filing.
        </Text>
      </Page>
    </Document>
  );
}
