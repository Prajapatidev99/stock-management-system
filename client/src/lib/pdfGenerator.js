import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateContactPDF(contact, stats, transactions = []) {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(31, 41, 55); // Dark Slate Header
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL STATEMENT & CONTACT PROFILE', 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 28);

  // Contact Details Box
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(contact.name || 'Contact Ledger', 14, 45);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Type: ${(contact.type || '').toUpperCase()}`, 14, 52);
  if (contact.phone) doc.text(`Phone: ${contact.phone}`, 14, 58);
  if (contact.address) doc.text(`Address: ${contact.address}`, 14, 64);

  // Financial Summary Cards
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(115, 38, 82, 38, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text('Gross Business:', 119, 44);
  doc.text('Deducted Returns:', 119, 50);
  doc.text('Net Total:', 119, 56);
  doc.text('Cash Paid:', 119, 62);
  doc.text('Online Paid:', 119, 68);
  doc.text('Pending Due:', 119, 73);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(fmt(stats?.grossAmount || stats?.totalAmount || 0), 162, 44);

  doc.setTextColor(217, 119, 6); // Orange/Yellow
  doc.text(fmt(stats?.returnAmount || 0), 162, 50);

  doc.setTextColor(17, 24, 39);
  doc.text(fmt(stats?.totalAmount || 0), 162, 56);

  doc.setTextColor(16, 185, 129); // Green
  doc.text(fmt(stats?.cashPaid || 0), 162, 62);

  doc.setTextColor(59, 130, 246); // Blue
  doc.text(fmt(stats?.onlinePaid || 0), 162, 68);

  doc.setTextColor(239, 68, 68); // Red
  doc.text(fmt(stats?.remainingBalance || 0), 162, 73);

  // Table of Transactions
  const tableData = transactions.map((t) => {
    const typeLabel = t.type === 'purchase' ? 'Purchase'
      : t.type === 'sale' ? 'Sale'
      : t.type === 'purchase_return' ? 'Return (Pur)'
      : t.type === 'sales_return' ? 'Return (Sale)' : t.type;

    return [
      format(new Date(t.date), 'dd MMM yyyy'),
      typeLabel,
      t.product_id?.name || 'N/A',
      `${t.quantity} units`,
      fmt(t.price),
      fmt(t.total_amount),
      (t.payment_mode || 'cash').toUpperCase(),
      fmt(t.amount_paid || 0),
      fmt(t.remaining_balance || 0),
    ];
  });

  autoTable(doc, {
    startY: 82,
    head: [['Date', 'Type', 'Product', 'Qty', 'Price', 'Total', 'Mode', 'Paid', 'Balance']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 35 },
      3: { cellWidth: 16 },
      4: { cellWidth: 20 },
      5: { cellWidth: 22 },
      6: { cellWidth: 16 },
      7: { cellWidth: 20 },
      8: { cellWidth: 20 },
    },
  });

  // Save File
  const filename = `${(contact.name || 'Contact').replace(/[^a-zA-Z0-9]/g, '_')}_Statement.pdf`;
  doc.save(filename);
}
