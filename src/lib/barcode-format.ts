export function normalizeIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn(value: string) {
  const isbn = normalizeIsbn(value);
  if (isbn.length === 13) {
    if (!isbn.startsWith("978") && !isbn.startsWith("979")) return false;
    const sum = isbn
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (isbn.length === 10) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false;
    const sum = isbn.split("").reduce((total, digit, index) => {
      const number = digit === "X" ? 10 : Number(digit);
      return total + number * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }
  return false;
}

function normalizeDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/** GTIN-8/12/13/14 (EAN-8, UPC-A, EAN-13, GTIN-14) mod-10 checksum. */
export function isValidGtin(value: string) {
  const digits = normalizeDigits(value);
  if (![8, 12, 13, 14].includes(digits.length)) return false;

  const sum = digits
    .split("")
    .slice(0, -1)
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 1 : 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[digits.length - 1]);
}

export type BarcodeKind = "isbn" | "product" | "unknown";

export function classifyBarcode(raw: string): { kind: BarcodeKind; normalized: string } {
  const isbnCandidate = normalizeIsbn(raw);
  if (isValidIsbn(isbnCandidate)) {
    return { kind: "isbn", normalized: isbnCandidate };
  }

  const digits = normalizeDigits(raw);
  if (isValidGtin(digits)) {
    return { kind: "product", normalized: digits };
  }

  return { kind: "unknown", normalized: digits || isbnCandidate };
}
