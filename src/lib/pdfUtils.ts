// src/lib/pdfUtils.ts
// Client-side PDF generation utility using pdfmake

/**
 * Creates a pdfmake document definition and returns a Blob representing the PDF.
 */
export async function createPdfBlob(docDefinition: any): Promise<Blob> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");

  const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
  const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;

  const vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts;
  pdfMake.addVirtualFileSystem(vfs);
  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  if (!(blob instanceof Blob) || !blob.size) throw new Error("El PDF generado está vacío.");
  return blob;
}

/**
 * Triggers a download of the given Blob with the specified filename.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}
