//import {API_HOST} from "../../../../../../../../config"; no references outside the pattern!!!!!!
const tailwindcss = "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.15/dist/tailwind.min.css";

export const selectablePDF = async (pdfRef, API_HOST) => {
    const html = `
                        <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <title>PDF</title>
                                <meta name="viewport" content="width=1600, initial-scale=1" />
                                <link rel="stylesheet" type="text/css" href="https://mitigateny.org/css/build.css" />
                                <style>
                                  @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800;900&family=IBM+Plex+Sans:wght@100;200;300;400;500;600;700&family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Montserrat:wght@100;200;300;400;500;600;700;800;900&family=Oswald:wght@300;500;700&family=Poppins:wght@100;200;300;400;500;600;700;800;900&family=Roboto:wght@100;300;400;500;700;900&family=Rubik:wght@300;400;500;600;700;800&family=Work+Sans:wght@100;200;300;400;500;600;700;800;900&display=swap');
                                </style>
                            </head>
                            <body style="padding:30px;width: 1400px">
                                ${pdfRef.current.innerHTML}
                            </body>
                            </html>`;
    console.log(html)
   const response = await fetch(`${API_HOST}/dama-admin/hazmit_dama/downloadpdf`,
       {
          method: 'POST',
          headers: {
             'Content-Type': 'text/html',
          },
          body: html,
       });
   console.log('res', response)
   if (response.ok) {
      const blob = await response.blob();
      console.log('blob', blob)
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
   } else {
      console.error('Failed to generate PDF');
   }
};