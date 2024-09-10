import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// this fn prints a page well, but doesn't give selectable text. good for printing.
export const printWellPdf = (pdfRef) => {
    const input = pdfRef.current;

    html2canvas(input, { scale: 2 }).then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');

        // PDF dimensions
        const pdfWidth = 210;  // A4 width in mm
        const pdfHeight = 297; // A4 height in mm
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        // Render the first page
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        // Render remaining pages if heightLeft is greater than 0
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;  // Adjust position for next page
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save('dynamic-content.pdf'); // Save the PDF
    });
};

