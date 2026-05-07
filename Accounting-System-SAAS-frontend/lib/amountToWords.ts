const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitsToWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? " " + ONES[o] : ""}`;
}

function threeDigitsToWords(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(" ");
}

export function amountToWords(
  amount: number,
  currency: string = "Rupees",
  fractionName: string = "Paise"
): string {
  if (isNaN(amount)) return "";

  const integerPart = Math.floor(amount);
  const fractionPart = Math.round((amount - integerPart) * 100);

  if (integerPart === 0 && fractionPart === 0) {
    return `${currency} Zero Only`;
  }

  let n = integerPart;
  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundredToOne = n;

  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundredToOne) parts.push(threeDigitsToWords(hundredToOne));

  let words = `${currency} ${parts.join(" ")}`;
  if (fractionPart > 0) {
    words += ` and ${twoDigitsToWords(fractionPart)} ${fractionName}`;
  }
  words += " Only";

  return words.replace(/\s+/g, " ").trim();
}
