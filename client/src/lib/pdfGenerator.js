import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

function pdfFmt(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateContactPDF(contact, stats, transactions = []) {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(31, 41, 55); // Dark Slate Header
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('STATEMENT OF ACCOUNT & CONTACT PROFILE', 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 27);

  // Contact Details Box
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(contact.name || 'Contact Ledger', 14, 46);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Contact Type: ${(contact.type || '').toUpperCase()}`, 14, 53);
  if (contact.phone) doc.text(`Phone: ${contact.phone}`, 14, 59);
  if (contact.address) doc.text(`Address: ${contact.address}`, 14, 65);

  // Financial Summary Box
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(110, 39, 88, 38, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text('Gross Business:', 114, 45);
  doc.text('Returns / Adjustments:', 114, 51);
  doc.text('Net Amount:', 114, 57);
  doc.text('Cash Received:', 114, 63);
  doc.text('Online Received:', 114, 69);
  doc.text('Pending Due Balance:', 114, 74);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(pdfFmt(stats?.grossAmount || stats?.totalAmount || 0), 194, 45, { align: 'right' });

  doc.setTextColor(217, 119, 6);
  doc.text(pdfFmt(stats?.returnAmount || 0), 194, 51, { align: 'right' });

  doc.setTextColor(17, 24, 39);
  doc.text(pdfFmt(stats?.totalAmount || 0), 194, 57, { align: 'right' });

  doc.setTextColor(16, 185, 129);
  doc.text(pdfFmt(stats?.cashPaid || 0), 194, 63, { align: 'right' });

  doc.setTextColor(59, 130, 246);
  doc.text(pdfFmt(stats?.onlinePaid || 0), 194, 68, { align: 'right' });

  doc.setTextColor(239, 68, 68);
  doc.text(pdfFmt(stats?.remainingBalance || 0), 194, 74, { align: 'right' });

  // Table of Transactions
  const tableData = transactions.map((t) => {
    const typeLabel = t.type === 'purchase' ? 'Purchase'
      : t.type === 'sale' ? 'Sale'
      : t.type === 'purchase_return' ? 'Purchase Return'
      : t.type === 'sales_return' ? 'Sales Return' : t.type;

    const modeLabel = t.payment_mode === 'cash' ? 'Cash'
      : t.payment_mode === 'online' ? 'Online/UPI'
      : t.payment_mode === 'credit' ? 'Credit' : (t.payment_mode || 'Cash');

    return [
      format(new Date(t.date), 'dd/MM/yyyy'),
      typeLabel,
      t.product_id?.name || 'N/A',
      t.quantity,
      pdfFmt(t.price),
      pdfFmt(t.total_amount),
      modeLabel,
      pdfFmt(t.amount_paid || 0),
      pdfFmt(t.remaining_balance || 0),
    ];
  });

  autoTable(doc, {
    startY: 82,
    head: [['Date', 'Type', 'Product', 'Qty', 'Unit Price', 'Total Amount', 'Mode', 'Amount Paid', 'Balance Due']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 24, halign: 'left' },
      2: { cellWidth: 32, halign: 'left' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 22, halign: 'right' },
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const totalPages = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(`Page ${data.pageNumber} of ${totalPages}`, 196, 287, { align: 'right' });
      doc.text('StockManager - Confidential Financial Statement', 14, 287);
    },
  });

  // Save File
  const filename = `${(contact.name || 'Contact').replace(/[^a-zA-Z0-9]/g, '_')}_Statement.pdf`;
  doc.save(filename);
}
