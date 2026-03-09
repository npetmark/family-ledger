/**
 * Parses shared notification text to extract monetary amounts.
 * Supports formats like: €50.00, 50,00 EUR, USD 1,234.56, $25, etc.
 */
export function parseAmount(text: string): number | null {
  // Common patterns for monetary values
  const patterns = [
    // €50.00 or € 50.00 or EUR 50.00
    /(?:€|EUR)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2}))/i,
    // 50.00€ or 50,00 EUR
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2}))\s*(?:€|EUR)/i,
    // $50.00 or USD 50.00
    /(?:\$|USD)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2}))/i,
    // 50.00$ or 50,00 USD
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2}))\s*(?:\$|USD)/i,
    // £50.00 or GBP 50.00
    /(?:£|GBP)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2}))/i,
    // Generic: any number that looks like money (with decimals)
    /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Normalize: remove thousand separators, use dot for decimal
      let numStr = match[1];
      // If comma is the last separator (European format), treat as decimal
      if (/,\d{2}$/.test(numStr)) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = numStr.replace(/,/g, '');
      }
      const value = parseFloat(numStr);
      if (!isNaN(value) && value > 0) {
        // Store as cents (bigint in DB)
        return Math.round(value * 100);
      }
    }
  }
  return null;
}

export function extractNote(text: string): string {
  // Try to extract a meaningful note by removing the amount part
  // Keep it simple — return the first 100 chars of the original text
  return text.slice(0, 100).trim();
}
