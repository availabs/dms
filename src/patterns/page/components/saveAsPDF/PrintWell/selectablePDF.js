

export const selectablePDF = async (pdfRef) => {
   const response = await fetch(`http://localhost:4444/dama-admin/hazmit_dama/downloadpdf`,
       {
          method: 'POST',
          headers: {
             'Content-Type': 'text/html',
          },
          body: pdfRef.current.innerHTML,
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