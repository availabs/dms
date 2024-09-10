import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// this fn prints a page well, but doesn't give selectable text. good for printing.
export const printWellPdf = (pdfRef) => {
    const input = pdfRef.current;

    // Use html2canvas to capture the content of the element
    html2canvas(input, { scale: 2 }).then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');

        // Adjust image width and height according to PDF size
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save('dynamic-content.pdf'); // Download the generated PDF
    });
};