import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface CompanyProfile {
  businessName: string;
  email: string;
  routingNumber: string;
  accountNumber: string;
}

export interface ClientProfile {
  name: string;
  email: string;
  address: string;
}

export interface InvoiceLedgerRow {
  invoice_number: string;
  due_date: string;
  subtotal_cents: number;
  tax_cents: number;
  grand_total_cents: number;
}

export interface InvoiceItem {
  title: string;
  description: string;
  total_cents: number;
}

interface InvoicePDFProps {
  profile: CompanyProfile;
  client: ClientProfile;
  invoice: InvoiceLedgerRow;
  items: InvoiceItem[];
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', backgroundColor: '#ffffff' },
  header: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', borderBottom: '2px solid #e5e7eb', paddingBottom: 15, marginBottom: 20 },
  companyName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  titleBlock: { textAlign: 'right' },
  invoiceTitle: { fontSize: 20, fontWeight: 'bold', color: '#0ea5e9' },
  metaRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  billTo: { width: '50%' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 },
  table: { display: 'flex', flexDirection: 'column', marginVertical: 15 },
  tableHeader: { display: 'flex', flexDirection: 'row', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: 6, fontWeight: 'bold' },
  tableRow: { display: 'flex', flexDirection: 'row', borderBottom: '1px solid #f3f4f6', padding: 8 },
  colDesc: { flexGrow: 2, width: '60%' },
  colAmount: { width: '40%', textAlign: 'right' },
  totalsBlock: { display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, marginBottom: 30 },
  totalsTable: { width: '40%', borderTop: '1px solid #e5e7eb', paddingTop: 8 },
  totalsRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: { fontSize: 12, fontWeight: 'bold', color: '#111827', borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 4 },
  
  // Zero-Fee Direct ACH Banking Instructions
  achPanel: { backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 6, padding: 12, marginTop: 20 },
  achHeader: { fontSize: 10, fontWeight: 'bold', color: '#0f766e', textTransform: 'uppercase', marginBottom: 6 },
  achInstruction: { fontSize: 9, color: '#115e59', lineHeight: 1.4, marginBottom: 8 },
  achMetaGrid: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achField: { width: '45%', display: 'flex', flexDirection: 'row' },
  achLabel: { fontWeight: 'bold', color: '#14b8a6', marginRight: 4 }
});

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const InvoicePDFDocument: React.FC<InvoicePDFProps> = ({ profile, client, invoice, items }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.companyName}>{profile.businessName || 'LLC Operations'}</Text>
          <Text>{profile.email}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
          <Text>Invoice #: {invoice.invoice_number}</Text>
          <Text>Due Date: {formatDate(invoice.due_date)}</Text>
        </View>
      </View>

      {/* Addresses */}
      <View style={styles.metaRow}>
        <View style={styles.billTo}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={{ fontWeight: 'bold', color: '#111827' }}>{client.name}</Text>
          <Text>{client.address}</Text>
          <Text>{client.email}</Text>
        </View>
      </View>

      {/* Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Line Item Details</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {items.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <View style={styles.colDesc}>
              <Text style={{ fontWeight: 'bold' }}>{item.title}</Text>
              <Text style={{ color: '#6b7280', fontSize: 8 }}>{item.description}</Text>
            </View>
            <Text style={styles.colAmount}>{formatCurrency(item.total_cents)}</Text>
          </View>
        ))}
      </View>

      {/* Totals */}
      <View style={styles.totalsBlock}>
        <View style={styles.totalsTable}>
          <View style={styles.totalsRow}>
            <Text>Subtotal:</Text>
            <Text>{formatCurrency(invoice.subtotal_cents)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax:</Text>
            <Text>{formatCurrency(invoice.tax_cents)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text>Grand Total:</Text>
            <Text>{formatCurrency(invoice.grand_total_cents)}</Text>
          </View>
        </View>
      </View>

      {/* B2B Zero-Fee ACH Payment Instructions */}
      <View style={styles.achPanel}>
        <Text style={styles.achHeader}>Direct ACH Bank-to-Bank Instruction</Text>
        <Text style={styles.achInstruction}>
          B2B payment processing is completed without commercial gateway fees. 
          Please log into your corporate treasury portal and initiate a standard direct bank-to-bank ACH "Push" transaction matching the Invoice Total above to our banking credentials below:
        </Text>
        <View style={styles.achMetaGrid}>
          <View style={styles.achField}>
            <Text style={styles.achLabel}>Beneficiary:</Text>
            <Text>{profile.businessName || 'LLC Operations'}</Text>
          </View>
          <View style={styles.achField}>
            <Text style={styles.achLabel}>Routing Number:</Text>
            <Text>{profile.routingNumber || 'N/A'}</Text>
          </View>
          <View style={styles.achField}>
            <Text style={styles.achLabel}>Account Number:</Text>
            <Text>{profile.accountNumber || 'N/A'}</Text>
          </View>
          <View style={styles.achField}>
            <Text style={styles.achLabel}>ACH Type:</Text>
            <Text>Direct Deposit (PPD/CCD)</Text>
          </View>
        </View>
      </View>
    </Page>
  </Document>
);
