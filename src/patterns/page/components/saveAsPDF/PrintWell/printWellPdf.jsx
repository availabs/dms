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

export const printWellPdfSingleColumn = async (pdfRef) => {
    const input = pdfRef.current;

    const pdf = new jsPDF('p', 'mm', 'a4');

    // PDF dimensions
    const pdfWidth = 210;  // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    const imgWidth = pdfWidth;

    let currentHeight = 0; // Track cumulative height

    // Select only divs that have an id attribute (i.e., parent sections)
    const divsWithIds = input.querySelectorAll('div[id]');

    // Helper function to generate canvas for each div
    const generateCanvas = (div) => {
        return html2canvas(div, { scale: 1 });
    };

    // Loop over divs with id and generate the PDF sequentially
    for (const div of divsWithIds) {
        const divCanvas = await generateCanvas(div);
        const divImgData = divCanvas.toDataURL('image/png');
        const divHeightInMM = (divCanvas.height * pdfWidth) / divCanvas.width;

        // If adding the div would exceed the page height, add a new page
        if (currentHeight + divHeightInMM > pdfHeight) {
            pdf.addPage();
            currentHeight = 0;  // Reset height for new page
        }

        // Add the div image to the current PDF page
        pdf.addImage(divImgData, 'PNG', 0, currentHeight, imgWidth, divHeightInMM);
        currentHeight += divHeightInMM; // Update cumulative height for the current page
    }

    pdf.save('dynamic-content.pdf');  // Save the generated PDF
};
