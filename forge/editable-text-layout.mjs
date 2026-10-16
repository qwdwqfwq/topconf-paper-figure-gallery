// Preserve the OCR text and font size in the shared editable scene. Each
// exporter receives the same explicit line breaks instead of a squeezed line.
export function layoutEditableText(value, {fontSize}){
  const original=String(value??'').replace(/\r\n?/g,'\n').trim();
  const size=Math.max(6,Number(fontSize)||18);
  return {text:original,fontSize:size};
}
