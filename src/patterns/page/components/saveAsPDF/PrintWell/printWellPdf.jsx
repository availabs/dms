// import html2canvas from "html2canvas";
// import jsPDF from "jspdf";
//
// // this fn prints a page well, but doesn't give selectable text. good for printing.
// export const printWellPdf = (pdfRef) => {
//     const input = pdfRef.current;
//
//     html2canvas(input, { scale: 2 }).then((canvas) => {
//         const imgData = canvas.toDataURL('image/png');
//         const pdf = new jsPDF('p', 'mm', 'a4');
//
//         // PDF dimensions
//         const pdfWidth = 210;  // A4 width in mm
//         const pdfHeight = 297; // A4 height in mm
//         const imgWidth = pdfWidth;
//         const imgHeight = (canvas.height * pdfWidth) / canvas.width;
//
//         let heightLeft = imgHeight;
//         let position = 0;
//
//         // Render the first page
//         pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
//         heightLeft -= pdfHeight;
//
//         // Render remaining pages if heightLeft is greater than 0
//         while (heightLeft > 0) {
//             position = heightLeft - imgHeight;  // Adjust position for next page
//             pdf.addPage();
//             pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
//             heightLeft -= pdfHeight;
//         }
//
//         pdf.save('dynamic-content.pdf'); // Save the PDF
//     });
// };
//
// export const printWellPdfSingleRow = async (pdfRef) => {
//     const input = pdfRef.current;
//     const divs = Array.from(input.querySelectorAll('div[data-size]'));  // Select all divs with IDs
//
//     // Define PDF dimensions
//     const pdfWidth = 210;  // A4 width in mm
//     const pdfHeight = 500; // A4 height in mm
//     const scale = 2;       // Scaling factor for higher resolution
//
//     // Convert PDF dimensions from mm to pixels
//     const pdfWidthPx = pdfWidth * 3.7795275591 * scale;
//     const pdfHeightPx = pdfHeight * 3.7795275591 * scale;
//
//     const pdf = new jsPDF('p', 'mm', 'a4');
//     let currentColSize = 0;
//     let currentRowDivs = [];
//     let yOffset = 0;  // Keeps track of vertical position for adding new rows
//
//     for (let i = 0; i < divs.length; i++) {
//         const div = divs[i];
//         const size = parseInt(div.dataset.size || 0, 10); // Get size from the dataset
//         const totalHeight = input.scrollHeight;
//
//         // Group divs into columns, summing size until it reaches 6
//         if (currentColSize + size <= 6) {
//             currentColSize += size;
//             currentRowDivs.push(div);
//         } else {
//             // Capture the current row as a single chunk
//             console.log('in loop', currentRowDivs)
//             await captureRowAsCanvas(pdf, currentRowDivs, yOffset, pdfWidthPx, pdfHeightPx, scale);
//
//             // Reset for next row
//             currentColSize = size;
//             currentRowDivs = [div];
//             yOffset += pdfHeightPx;  // Move the offset down for the next row
//         }
//     }
//
//     // Capture any remaining divs in the last row
//     if (currentRowDivs.length > 0) {
//         console.log('final', currentRowDivs)
//         await captureRowAsCanvas(pdf, currentRowDivs, yOffset, pdfWidthPx, pdfHeightPx, scale);
//     }
//
//     pdf.save('dynamic-content.pdf');
// };
//
// const captureRowAsCanvas = async (pdf, rowDivs, yOffset, pdfWidthPx, pdfHeightPx, scale) => {
//     // Create a temporary wrapper to hold the row of divs
//     const wrapper = document.createElement('div');
//     wrapper.style.display = 'flex'; // Align divs horizontally
//     wrapper.style.width = `${pdfWidthPx / scale}px`;
//     wrapper.style.height = 'auto';
//     wrapper.style.overflow = 'hidden';
//
//     rowDivs.forEach((div) => {
//         const clonedDiv = div.cloneNode(true);
//         wrapper.appendChild(clonedDiv);  // Append cloned divs to the wrapper
//     });
//
//     // Append the wrapper to the body for rendering
//     document.body.appendChild(wrapper);
//
//     // Use html2canvas to capture the wrapper with divs in a row
//     const canvas = await html2canvas(wrapper, {
//         scale: scale,
//         width: pdfWidthPx / scale,
//         height: pdfHeightPx / scale,
//     });
//
//     const imgData = canvas.toDataURL('image/png');
//     const imgWidth = pdf.internal.pageSize.getWidth();
//     const imgHeight = (canvas.height * imgWidth) / canvas.width;
//
//     // Add to PDF
//     if (pdf.getNumberOfPages() > 0) {
//         pdf.addPage();
//     }
//
//     pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
//
//     // Remove the wrapper after capturing
//     document.body.removeChild(wrapper);
// };
//
//
