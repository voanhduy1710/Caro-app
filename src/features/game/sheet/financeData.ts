import { columnLabel } from '../../../shared/utils/gomokuLogic';
import { formatNumber } from './sheetStyle';

/**
 * The two fake reports ESC flips to. They have to survive a second look, so
 * the totals really are the sums of their lines, every percentage really is
 * computed from its row, and the formula bar shows the formula that would
 * produce each derived cell. All amounts are kept in millions of đồng and
 * printed in full.
 */

export type ReportTone = 'pos' | 'neg' | null;

export interface ReportCell {
  display: string;
  /** What the formula bar shows for this cell. */
  raw: string;
  align: 'left' | 'right';
  tone: ReportTone;
  /** Numeric value for the status bar's Sum/Average, in đồng. */
  value: number | null;
}

export interface ReportRow {
  bold: boolean;
  cells: ReportCell[];
}

export interface ReportTable {
  /** The tab name, also used as the report's title. */
  name: string;
  headers: string[];
  /** Pixel width per column. */
  widths: number[];
  rows: ReportRow[];
  /** Totals over the cumulative column, for the status bar. */
  stats: { sum: number; count: number; average: number };
}

/** The header row is sheet row 1, so data row `i` is sheet row `i + 2`. */
const sheetRow = (index: number) => index + 2;

const MILLION = 1_000_000;

const textCell = (text: string): ReportCell => ({ display: text, raw: text, align: 'left', tone: null, value: null });

const moneyCell = (millions: number, formula: string | null): ReportCell => {
  const value = millions * MILLION;
  return {
    display: formatNumber(value),
    raw: formula ?? String(Math.round(value)),
    align: 'right',
    tone: null,
    value,
  };
};

const signedMoneyCell = (millions: number, formula: string): ReportCell => {
  const value = millions * MILLION;
  return {
    display: `${value > 0 ? '+' : ''}${formatNumber(value)}`,
    raw: formula,
    align: 'right',
    tone: value > 0 ? 'pos' : value < 0 ? 'neg' : null,
    value,
  };
};

const percentCell = (ratio: number, formula: string): ReportCell => {
  const percent = Math.round(ratio * 1000) / 10;
  return {
    display: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`,
    raw: formula,
    align: 'right',
    tone: percent > 0 ? 'pos' : percent < 0 ? 'neg' : null,
    value: null,
  };
};

/* ------------------------------ income report ----------------------------- */

interface IncomeLine {
  code: string;
  label: string;
  /** A posted line: three months plus the quarter's plan, in millions. */
  months?: [number, number, number];
  plan?: number;
  /** A derived line: signed references to other lines by code. */
  sum?: Array<[string, 1 | -1]>;
  /** A derived line taxed at a flat rate of another line. */
  taxOf?: string;
  bold?: boolean;
}

const INCOME_LINES: IncomeLine[] = [
  { code: 'REV-01', label: 'DOANH THU THUẦN', sum: [['REV-02', 1], ['REV-03', 1], ['REV-04', -1]], bold: true },
  { code: 'REV-02', label: 'Doanh thu bán hàng', months: [11240, 11760, 12410], plan: 35000 },
  { code: 'REV-03', label: 'Doanh thu cung cấp dịch vụ', months: [3580, 3720, 3950], plan: 11000 },
  { code: 'REV-04', label: 'Các khoản giảm trừ doanh thu', months: [300, 300, 320], plan: 900 },
  { code: 'COGS-01', label: 'Giá vốn hàng bán', months: [8420, 8690, 9150], plan: 26000 },
  { code: 'GP-01', label: 'LỢI NHUẬN GỘP', sum: [['REV-01', 1], ['COGS-01', -1]], bold: true },
  { code: 'OPEX-01', label: 'CHI PHÍ HOẠT ĐỘNG', sum: [['OPEX-02', 1], ['OPEX-03', 1], ['OPEX-04', 1], ['OPEX-05', 1]], bold: true },
  { code: 'OPEX-02', label: 'Chi phí bán hàng', months: [1260, 1310, 1420], plan: 3900 },
  { code: 'OPEX-03', label: 'Chi phí quản lý doanh nghiệp', months: [980, 1010, 1040], plan: 3000 },
  { code: 'OPEX-04', label: 'Chi phí nhân sự', months: [1540, 1560, 1610], plan: 4800 },
  { code: 'OPEX-05', label: 'Chi phí marketing', months: [420, 510, 580], plan: 1350 },
  { code: 'EBIT-01', label: 'LỢI NHUẬN TỪ HĐKD (EBIT)', sum: [['GP-01', 1], ['OPEX-01', -1]], bold: true },
  { code: 'FIN-01', label: 'Doanh thu hoạt động tài chính', months: [85, 92, 101], plan: 260 },
  { code: 'FIN-02', label: 'Chi phí lãi vay', months: [210, 205, 198], plan: 630 },
  { code: 'EBT-01', label: 'LỢI NHUẬN TRƯỚC THUẾ', sum: [['EBIT-01', 1], ['FIN-01', 1], ['FIN-02', -1]], bold: true },
  { code: 'TAX-01', label: 'Chi phí thuế TNDN (20%)', taxOf: 'EBT-01' },
  { code: 'NET-01', label: 'LỢI NHUẬN SAU THUẾ', sum: [['EBT-01', 1], ['TAX-01', -1]], bold: true },
];

const TAX_RATE = 0.2;

const buildIncome = (): ReportTable => {
  const index = new Map(INCOME_LINES.map((line, i) => [line.code, i]));
  // Four numeric series per line: Jul, Aug, Sep, plan (columns C, D, E, G).
  const values = new Map<string, number[]>();
  const seriesColumns = [2, 3, 4, 6];

  const resolve = (code: string): number[] => {
    const cached = values.get(code);
    if (cached) return cached;
    const line = INCOME_LINES[index.get(code) ?? -1];
    let series: number[];
    if (line.months && line.plan !== undefined) {
      series = [...line.months, line.plan];
    } else if (line.taxOf) {
      series = resolve(line.taxOf).map((v) => Math.round(v * TAX_RATE));
    } else {
      series = [0, 0, 0, 0];
      for (const [ref, sign] of line.sum ?? []) {
        resolve(ref).forEach((v, i) => {
          series[i] += sign * v;
        });
      }
    }
    values.set(code, series);
    return series;
  };

  const formulaFor = (line: IncomeLine, column: number): string | null => {
    const letter = columnLabel(column);
    if (line.taxOf) return `=ROUND(${letter}${sheetRow(index.get(line.taxOf) ?? 0)}*20%,0)`;
    if (!line.sum) return null;
    return `=${line.sum
      .map(([ref, sign], i) => `${sign < 0 ? '-' : i === 0 ? '' : '+'}${letter}${sheetRow(index.get(ref) ?? 0)}`)
      .join('')}`;
  };

  let sum = 0;
  let count = 0;
  const rows: ReportRow[] = INCOME_LINES.map((line, i) => {
    const row = sheetRow(i);
    const series = resolve(line.code);
    const [jul, aug, sep, plan] = series;
    const cumulative = jul + aug + sep;
    if (!line.sum && !line.taxOf) {
      sum += cumulative * MILLION;
      count += 1;
    }
    const monthCells = [jul, aug, sep].map((v, m) => moneyCell(v, formulaFor(line, seriesColumns[m])));
    return {
      bold: Boolean(line.bold),
      cells: [
        textCell(line.code),
        textCell(line.label),
        ...monthCells,
        moneyCell(cumulative, `=SUM(C${row}:E${row})`),
        moneyCell(plan, formulaFor(line, 6)),
        percentCell(plan ? (cumulative - plan) / plan : 0, `=(F${row}-G${row})/G${row}`),
      ],
    };
  });

  return {
    name: 'Doanh_Thu_Q3',
    headers: ['Mã', 'Khoản Mục Tài Chính', 'Tháng 7/2026', 'Tháng 8/2026', 'Tháng 9/2026', 'Lũy Kế Q3', 'Kế Hoạch', 'Tỷ Lệ (%)'],
    widths: [84, 250, 128, 128, 128, 140, 140, 92],
    rows,
    stats: { sum, count, average: count ? sum / count : 0 },
  };
};

/* ------------------------------ balance sheet ----------------------------- */

interface BalanceLine {
  code: string;
  label: string;
  /** Opening and closing balance, in millions. */
  amounts?: [number, number];
  sum?: string[];
  /** Equity's retained earnings: whatever balances assets against sources. */
  balancing?: boolean;
  bold?: boolean;
}

const BALANCE_LINES: BalanceLine[] = [
  { code: '100', label: 'A. TÀI SẢN NGẮN HẠN', sum: ['110', '130', '140'], bold: true },
  { code: '110', label: 'Tiền và các khoản tương đương tiền', amounts: [8450, 9820] },
  { code: '130', label: 'Các khoản phải thu ngắn hạn', amounts: [12300, 11640] },
  { code: '140', label: 'Hàng tồn kho', amounts: [9870, 10450] },
  { code: '200', label: 'B. TÀI SẢN DÀI HẠN', sum: ['220', '240'], bold: true },
  { code: '220', label: 'Tài sản cố định', amounts: [21600, 20980] },
  { code: '240', label: 'Tài sản dở dang dài hạn', amounts: [3200, 4150] },
  { code: '270', label: 'TỔNG CỘNG TÀI SẢN', sum: ['100', '200'], bold: true },
  { code: '300', label: 'C. NỢ PHẢI TRẢ', sum: ['310', '330'], bold: true },
  { code: '310', label: 'Nợ ngắn hạn', amounts: [15400, 14870] },
  { code: '330', label: 'Nợ dài hạn', amounts: [10200, 9600] },
  { code: '400', label: 'D. VỐN CHỦ SỞ HỮU', sum: ['411', '421'], bold: true },
  { code: '411', label: 'Vốn góp của chủ sở hữu', amounts: [25000, 25000] },
  { code: '421', label: 'Lợi nhuận sau thuế chưa phân phối', balancing: true },
  { code: '440', label: 'TỔNG CỘNG NGUỒN VỐN', sum: ['300', '400'], bold: true },
];

const buildBalance = (): ReportTable => {
  const index = new Map(BALANCE_LINES.map((line, i) => [line.code, i]));
  const values = new Map<string, number[]>();

  const resolve = (code: string): number[] => {
    const cached = values.get(code);
    if (cached) return cached;
    const line = BALANCE_LINES[index.get(code) ?? -1];
    let series: number[];
    if (line.amounts) {
      series = [...line.amounts];
    } else if (line.balancing) {
      // Retained earnings close the books: total assets less liabilities less
      // paid-in capital, so the two grand totals always agree.
      const assets = resolve('270');
      const liabilities = resolve('300');
      const capital = resolve('411');
      series = assets.map((v, i) => v - liabilities[i] - capital[i]);
    } else {
      series = [0, 0];
      for (const ref of line.sum ?? []) {
        resolve(ref).forEach((v, i) => {
          series[i] += v;
        });
      }
    }
    values.set(code, series);
    return series;
  };

  const formulaFor = (line: BalanceLine, letter: string): string | null => {
    if (line.balancing) {
      const ref = (code: string) => `${letter}${sheetRow(index.get(code) ?? 0)}`;
      return `=${ref('270')}-${ref('300')}-${ref('411')}`;
    }
    if (!line.sum) return null;
    return `=${line.sum.map((code) => `${letter}${sheetRow(index.get(code) ?? 0)}`).join('+')}`;
  };

  let sum = 0;
  let count = 0;
  const rows: ReportRow[] = BALANCE_LINES.map((line, i) => {
    const row = sheetRow(i);
    const [opening, closing] = resolve(line.code);
    if (!line.sum) {
      sum += closing * MILLION;
      count += 1;
    }
    return {
      bold: Boolean(line.bold),
      cells: [
        textCell(line.code),
        textCell(line.label),
        moneyCell(opening, formulaFor(line, 'C')),
        moneyCell(closing, formulaFor(line, 'D')),
        signedMoneyCell(closing - opening, `=D${row}-C${row}`),
      ],
    };
  });

  return {
    name: 'Can_Doi_Ke_Toan',
    headers: ['Mã Số', 'Chỉ Tiêu', 'Số Đầu Năm', 'Số Cuối Kỳ Q3', 'Biến Động'],
    widths: [76, 290, 150, 150, 150],
    rows,
    stats: { sum, count, average: count ? sum / count : 0 },
  };
};

/** Built once: the reports never change while the page is open. */
export const REPORTS: Record<'finance' | 'balance', ReportTable> = {
  finance: buildIncome(),
  balance: buildBalance(),
};
