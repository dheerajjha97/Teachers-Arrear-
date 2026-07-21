"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  FileDown, 
  Plus, 
  Trash2, 
  Sparkles, 
  Calendar, 
  Settings, 
  RefreshCw, 
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Copy,
  Award,
  FileSpreadsheet,
  Check,
  Cloud
} from 'lucide-react';

// Interfaces
interface SalaryDetails {
  basic: number;
  da: number;
  hra: number;
  ma: number;
  gross: number;
  nps: number;
  gis: number;
  net: number;
}

interface ArrearRow {
  id: string;
  month: string;
  days: number;
  dueDaPercent?: number;   // Row-specific Due DA %
  drawnDaPercent?: number; // Row-specific Drawn DA %
  dueHraPercent?: number;  // Row-specific Due HRA %
  drawnHraPercent?: number;// Row-specific Drawn HRA %
  due: SalaryDetails;
  drawn: SalaryDetails;
  diff: SalaryDetails;
  // Overrides to preserve manual edits
  overrides?: {
    due?: Partial<SalaryDetails>;
    drawn?: Partial<SalaryDetails>;
  };
  fullDueBasic?: number;
  fullDrawnBasic?: number;
}

interface TeacherInfo {
  schoolName: string;
  teacherName: string;
  pran: string;
  designation: string;
  accountNo: string;
  blockName: string;
  dateOfJoining: string;
  ifsc: string;
}

// Default Constants
const DEFAULT_DUE_DA_PERCENT = 55;   // Defaulting to Jan 25 which is in the active range, but will auto-calculate
const DEFAULT_DRAWN_DA_PERCENT = 50; // Typically lower before the revision
const DEFAULT_DUE_HRA_PERCENT = 5;    // Standard rural / lowest town slab is now 5% (options: 5%, 7.5%, 10%, 20%)
const DEFAULT_DRAWN_HRA_PERCENT = 4;  // Standard rural / lowest town slab was 4%
const DEFAULT_MA = 1000;
const DEFAULT_GIS = 30;
const DEFAULT_IS_NPS = true;

const FITMENT_MATRIX: Record<string, number[]> = {
  "I-V": [
    25000, 25750, 26520, 27320, 28140, 28980, 29850, 30750, 31670, 32620,
    33600, 34610, 35640, 36710, 37810, 38940, 40110, 41320, 42550, 43830
  ],
  "VI-VIII": [
    28000, 28840, 29700, 30600, 31510, 32460, 33430, 34440, 35470, 36530,
    37630, 38760, 39920, 41120, 42350, 43620, 44930, 46280, 47660, 49090
  ],
  "वरीय VI-VIII": [
    30000, 30900, 31830, 32780, 33760, 34770, 35810, 36880, 37990, 39130,
    40300, 41510, 42750, 44030, 45350, 46710, 48110, 49550, 51040, 52570
  ],
  "IX-X": [
    31000, 31930, 32890, 33870, 34890, 35940, 37020, 38130, 39270, 40450,
    41660, 42910, 44200, 45520, 46890, 48300, 49750, 51240, 52770, 54360
  ],
  "XI-XII": [
    32000, 32960, 33950, 34970, 36020, 37100, 38210, 39360, 40540, 41750,
    43000, 44290, 45620, 46990, 48400, 49850, 51350, 52890, 54470, 56110
  ],
  "वरीय XI-XII": [
    34000, 35020, 36070, 37150, 38270, 39410, 40600, 41820, 43070, 44360,
    45690, 47060, 48480, 49930, 51430, 52970, 54560, 56200, 57880, 59620
  ]
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getBasicSalaryForMonth(
  category: string,
  startMonth: number,
  startYear: number,
  initialIndex: number,
  incrementMonth: "january" | "july" | "none",
  targetMonthStr: string
): number {
  const salaries = FITMENT_MATRIX[category];
  if (!salaries) return salaries?.[initialIndex - 1] || 25000;

  const match = targetMonthStr.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return salaries[initialIndex - 1] || salaries[0];

  const targetMonthName = match[1];
  const targetYear = parseInt(match[2], 10);
  const targetMonthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(targetMonthName.toLowerCase().substring(0, 3)));
  if (targetMonthIdx === -1) return salaries[initialIndex - 1] || salaries[0];

  if (incrementMonth === "none") {
    return salaries[initialIndex - 1] || salaries[0];
  }

  const incrementMonthIdx = incrementMonth === "january" ? 0 : 6;

  // If target date is before start date, return initial index salary
  if (targetYear < startYear || (targetYear === startYear && targetMonthIdx < startMonth)) {
    return salaries[initialIndex - 1] || salaries[0];
  }

  let currentIndex = initialIndex;
  let currM = startMonth;
  let currY = startYear;

  while (currY < targetYear || (currY === targetYear && currM < targetMonthIdx)) {
    if (currM === 11) {
      currM = 0;
      currY++;
    } else {
      currM++;
    }

    if (currM === incrementMonthIdx) {
      currentIndex = Math.min(20, currentIndex + 1);
    }
  }

  return salaries[currentIndex - 1] || salaries[0];
}

function getMaxDaysInMonth(monthStr: string): number {
  const match = monthStr.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return 30;
  const monthName = match[1];
  const year = parseInt(match[2], 10);
  const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.toLowerCase().substring(0, 3)));
  if (monthIdx === -1) return 30;
  return new Date(year, monthIdx + 1, 0).getDate();
}

// Helper to determine Bihar government DA rate dynamically based on month & year
function getAutoDaPercent(monthStr: string, fallbackVal: number): number {
  const match = monthStr.match(/([A-Za-z]+)\s+(\d{4}|\d{2})/);
  if (!match) return fallbackVal;
  
  const monthName = match[1].toLowerCase();
  let year = parseInt(match[2], 10);
  if (year < 100) {
    year += 2000; // Format 24 to 2024
  }
  
  const monthIndex = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.substring(0, 3)));
  if (monthIndex === -1) return fallbackVal;
  
  // Fixed DA rates according to user's instruction:
  // - Jan 24 to Jun 24 = 50%
  // - July 24 to Dec 24 = 53%
  // - Jan 25 to Jun 25 = 55%
  // - July 25 to Dec 25 = 58%
  // - Jan 26 to Jun 26 = 60%
  if (year >= 2026) {
    return monthIndex >= 6 ? 60 : 60; // Jan 26 se Jun 26 = 60% (Jul 26 onwards also defaults to 60% or as applicable)
  }
  if (year === 2025) {
    return monthIndex >= 6 ? 58 : 55; // July 25 se Dec 25 = 58%, Jan 25 se Jun 25 = 55%
  }
  if (year === 2024) {
    return monthIndex >= 6 ? 53 : 50; // July 24 se Dec 24 = 53%, Jan 24 se Jun 24 = 50%
  }
  if (year === 2023) {
    return monthIndex >= 6 ? 46 : 42; // July 23 se Dec 23 = 46%, Jan 23 se Jun 23 = 42%
  }
  if (year === 2022) {
    return monthIndex >= 6 ? 38 : 34; // July 22 se Dec 22 = 38%, Jan 22 se Jun 22 = 34%
  }
  if (year === 2021) {
    return monthIndex >= 6 ? 31 : 17; // July 21 se Dec 21 = 31%, Jan 21 se Jun 21 = 17%
  }
  return 17; // fallback
}

// Helper to determine Bihar government Drawn DA rate (the rate drawn before the DA hike arrears were settled)
function getAutoDrawnDaPercent(monthStr: string, fallbackVal: number): number {
  const match = monthStr.match(/([A-Za-z]+)\s+(\d{4}|\d{2})/);
  if (match) {
    const monthName = match[1].toLowerCase();
    let year = parseInt(match[2], 10);
    if (year < 100) {
      year += 2000; // Format 24 to 2024
    }
    const monthIndex = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.substring(0, 3)));
    if (monthIndex !== -1) {
      // Drawn salary me March 24 se Nov 25 se 50% DA mila hai
      if (
        (year === 2024 && monthIndex >= 2) || // March 2024 to Dec 2024
        (year === 2025 && monthIndex <= 10)    // Jan 2025 to Nov 2025
      ) {
        return 50;
      }
    }
  }

  const dueDa = getAutoDaPercent(monthStr, fallbackVal);
  if (dueDa === 60) return 58;
  if (dueDa === 58) return 55;
  if (dueDa === 55) return 53;
  if (dueDa === 53) return 50;
  if (dueDa === 50) return 46;
  if (dueDa === 46) return 42;
  if (dueDa === 42) return 38;
  if (dueDa === 38) return 34;
  if (dueDa === 34) return 31;
  if (dueDa === 31) return 17; // Before 31%, it was 17% (due to Covid freeze)
  return dueDa;
}

// Helper to map Due HRA category to Drawn HRA category (e.g. 5% due means 4% was drawn under old scales)
function getAutoDrawnHraPercent(dueHra: number): number {
  if (dueHra === 5) return 4;
  if (dueHra === 7.5) return 6;
  if (dueHra === 10) return 8;
  if (dueHra === 20) return 16;
  return dueHra;
}

// Helper to determine the 6-month block for page splitting (Jan-Jun vs Jul-Dec)
function getRowPeriodKey(monthStr: string): { key: string; label: string; year: number; half: 1 | 2 } {
  const cleanStr = monthStr.trim();
  let year = 2025;
  const yearMatch = cleanStr.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }
  
  let monthIndex = 0;
  const lowerStr = cleanStr.toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const mName = MONTH_NAMES[i].toLowerCase();
    if (lowerStr.includes(mName) || lowerStr.includes(mName.substring(0, 3))) {
      monthIndex = i;
      break;
    }
  }
  
  const half = monthIndex <= 5 ? 1 : 2; // 1 = Jan-Jun, 2 = Jul-Dec
  const label = half === 1 ? `January - June ${year}` : `July - December ${year}`;
  const key = `${year}-${half}`;
  return { key, label, year, half };
}

// Number to Indian Rupees Words Converter
function convertNumberToWords(num: number): string {
  if (num === 0) return "Rupees Zero Only";
  
  const isNegative = num < 0;
  const absoluteNum = Math.abs(num);
  
  const parts = absoluteNum.toString().split(".");
  const rupees = parseInt(parts[0], 10);
  const paise = parts[1] ? parseInt(parts[1].substring(0, 2), 10) : 0;
  
  const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const doubleDigits = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  function convertLessThanThousand(n: number): string {
    let str = "";
    if (n >= 100) {
      str += singleDigits[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 10 && n < 20) {
      str += doubleDigits[n - 10] + " ";
    } else if (n >= 20 || n === 10) {
      str += tens[Math.floor(n / 10)] + " " + singleDigits[n % 10] + " ";
    } else if (n > 0) {
      str += singleDigits[n] + " ";
    }
    return str;
  }
  
  let result = "";
  let temp = rupees;
  
  if (temp >= 10000000) { // Crore
    result += convertLessThanThousand(Math.floor(temp / 10000000)) + "Crore ";
    temp %= 10000000;
  }
  if (temp >= 100000) { // Lakh
    result += convertLessThanThousand(Math.floor(temp / 100000)) + "Lakh ";
    temp %= 100000;
  }
  if (temp >= 1000) { // Thousand
    result += convertLessThanThousand(Math.floor(temp / 1000)) + "Thousand ";
    temp %= 1000;
  }
  if (temp > 0) {
    result += convertLessThanThousand(temp);
  }
  
  let finalStr = (isNegative ? "Minus " : "") + "Rupees " + result.trim();
  
  if (paise > 0) {
    let paiseStr = "";
    if (paise >= 10 && paise < 20) {
      paiseStr = doubleDigits[paise - 10];
    } else if (paise >= 20 || paise === 10) {
      paiseStr = tens[Math.floor(paise / 10)] + " " + singleDigits[paise % 10];
    } else {
      paiseStr = singleDigits[paise];
    }
    finalStr += " and " + paiseStr.trim() + " Paise";
  }
  
  finalStr += " Only";
  return finalStr.replace(/\s+/g, ' ');
}

// Calculations (Module Level to satisfy ESLint)
const calculateRowDetails = (
  basic: number,
  daPercent: number,
  hraPercent: number,
  medicalAllowance: number,
  gisAllowance: number,
  isNpsApplicable: boolean,
  overrides?: Partial<SalaryDetails>
): SalaryDetails => {
  const actualBasic = overrides?.basic !== undefined ? overrides.basic : basic;
  const da = overrides?.da !== undefined ? overrides.da : Math.round(actualBasic * (daPercent / 100));
  const hra = overrides?.hra !== undefined ? overrides.hra : Math.round(actualBasic * (hraPercent / 100));
  const ma = overrides?.ma !== undefined ? overrides.ma : medicalAllowance;
  const gross = actualBasic + da + hra + ma;
  
  const nps = overrides?.nps !== undefined 
    ? overrides.nps 
    : (isNpsApplicable ? Math.round((actualBasic + da) * 0.10) : 0);
    
  const gis = overrides?.gis !== undefined ? overrides.gis : gisAllowance;
  const net = gross - nps - gis;
  
  return { basic: actualBasic, da, hra, ma, gross, nps, gis, net };
};

const calculateDiffDetails = (due: SalaryDetails, drawn: SalaryDetails): SalaryDetails => {
  return {
    basic: due.basic - drawn.basic,
    da: due.da - drawn.da,
    hra: due.hra - drawn.hra,
    ma: due.ma - drawn.ma,
    gross: due.gross - drawn.gross,
    nps: due.nps - drawn.nps,
    gis: due.gis - drawn.gis,
    net: due.net - drawn.net
  };
};

const createNewRow = (
  monthStr: string, 
  daysCount: number, 
  dueBasic: number, 
  drawnBasic: number,
  dueDaPercent: number,
  drawnDaPercent: number,
  dueHraPercent: number,
  drawnHraPercent: number,
  medicalAllowance: number,
  gisAllowance: number,
  isNpsApplicable: boolean,
  useAutoDa: boolean = true
): ArrearRow => {
  const resolvedDueDa = useAutoDa ? getAutoDaPercent(monthStr, dueDaPercent) : dueDaPercent;
  const resolvedDrawnDa = useAutoDa ? getAutoDrawnDaPercent(monthStr, drawnDaPercent) : drawnDaPercent;
  const resolvedDueHra = dueHraPercent;
  const resolvedDrawnHra = drawnHraPercent;
  
  const maxDays = getMaxDaysInMonth(monthStr);
  const prorationFactor = daysCount / maxDays;
  const proratedDueBasic = Math.round(dueBasic * prorationFactor);
  const proratedDrawnBasic = Math.round(drawnBasic * prorationFactor);
  const proratedMedical = Math.round(medicalAllowance * prorationFactor);
  const proratedGis = Math.round(gisAllowance * prorationFactor);

  const due = calculateRowDetails(proratedDueBasic, resolvedDueDa, resolvedDueHra, proratedMedical, proratedGis, isNpsApplicable);
  const drawn = calculateRowDetails(proratedDrawnBasic, resolvedDrawnDa, resolvedDrawnHra, proratedMedical, proratedGis, isNpsApplicable);
  const diff = calculateDiffDetails(due, drawn);
  
  return {
    id: Math.random().toString(36).substr(2, 9),
    month: monthStr,
    days: daysCount,
    dueDaPercent: resolvedDueDa,
    drawnDaPercent: resolvedDrawnDa,
    dueHraPercent: resolvedDueHra,
    drawnHraPercent: resolvedDrawnHra,
    due,
    drawn,
    diff,
    fullDueBasic: dueBasic,
    fullDrawnBasic: drawnBasic
  };
};

export default function SalaryArrearPortal() {
  // Global States (loaded from localStorage on mount)
  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo>({
    schoolName: '',
    teacherName: '',
    pran: '',
    designation: '',
    accountNo: '',
    blockName: '',
    dateOfJoining: '',
    ifsc: '',
  });

  const [teacherCategory, setTeacherCategory] = useState<string>("I-V");
  const [initialDueIndex, setInitialDueIndex] = useState<number>(1);
  const [initialDrawnIndex, setInitialDrawnIndex] = useState<number>(1);
  const [isDrawnBasicSame, setIsDrawnBasicSame] = useState<boolean>(true);
  const [incrementMonth, setIncrementMonth] = useState<"january" | "july" | "none">("none");
  const [useFitmentMatrix, setUseFitmentMatrix] = useState<boolean>(true);

  const [dueDaPercent, setDueDaPercent] = useState<number>(DEFAULT_DUE_DA_PERCENT);
  const [drawnDaPercent, setDrawnDaPercent] = useState<number>(DEFAULT_DRAWN_DA_PERCENT);
  const [dueHraPercent, setDueHraPercent] = useState<number>(DEFAULT_DUE_HRA_PERCENT);
  const [drawnHraPercent, setDrawnHraPercent] = useState<number>(DEFAULT_DRAWN_HRA_PERCENT);
  const [medicalAllowance, setMedicalAllowance] = useState<number>(DEFAULT_MA);
  const [gisAllowance, setGisAllowance] = useState<number>(DEFAULT_GIS);
  const [isNpsApplicable, setIsNpsApplicable] = useState<boolean>(DEFAULT_IS_NPS);
  const [useAutoDa, setUseAutoDa] = useState<boolean>(true);

  const [rows, setRows] = useState<ArrearRow[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Bulk generation state
  const [startMonth, setStartMonth] = useState<number>(2); // March
  const [startYear, setStartYear] = useState<number>(2025);
  const [endMonth, setEndMonth] = useState<number>(11); // December
  const [endYear, setEndYear] = useState<number>(2025);
  const [startDueBasic, setStartDueBasic] = useState<number>(35400);
  const [startDrawnBasic, setStartDrawnBasic] = useState<number>(35400);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [pdfPageSplitMode, setPdfPageSplitMode] = useState<'six-months' | 'yearly' | 'single-page'>('six-months');
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Modal states for safe confirmations inside iframes
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [showDeleteErrorModal, setShowDeleteErrorModal] = useState<boolean>(false);
  const [showBulkGenerateModal, setShowBulkGenerateModal] = useState<boolean>(false);
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);

  // Auto-save states
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'idle'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Load from LocalStorage
  useEffect(() => {
    const cachedTeacher = localStorage.getItem('arrear_teacher_info');
    const cachedRows = localStorage.getItem('arrear_rows');
    const cachedDueDa = localStorage.getItem('arrear_due_da') || localStorage.getItem('arrear_da');
    const cachedDrawnDa = localStorage.getItem('arrear_drawn_da');
    const cachedDueHra = localStorage.getItem('arrear_due_hra') || localStorage.getItem('arrear_hra');
    const cachedDrawnHra = localStorage.getItem('arrear_drawn_hra');
    const cachedMa = localStorage.getItem('arrear_ma');
    const cachedGis = localStorage.getItem('arrear_gis');
    const cachedNps = localStorage.getItem('arrear_nps');
    const cachedUseAutoDa = localStorage.getItem('arrear_use_auto_da');

    // Fitment state cache
    const cachedTeacherCategory = localStorage.getItem('arrear_teacher_category') || 'I-V';
    const cachedInitialDueIndex = localStorage.getItem('arrear_initial_due_index') || '1';
    const cachedInitialDrawnIndex = localStorage.getItem('arrear_initial_drawn_index') || '1';
    const cachedIsDrawnBasicSame = localStorage.getItem('arrear_is_drawn_basic_same') || 'true';
    const cachedIncrementMonth = localStorage.getItem('arrear_increment_month') || 'none';
    const cachedUseFitmentMatrix = localStorage.getItem('arrear_use_fitment_matrix') || 'true';

    let currentDueDa = DEFAULT_DUE_DA_PERCENT;
    let currentDrawnDa = DEFAULT_DRAWN_DA_PERCENT;
    let currentDueHra = DEFAULT_DUE_HRA_PERCENT;
    let currentDrawnHra = DEFAULT_DRAWN_HRA_PERCENT;
    let currentMa = DEFAULT_MA;
    let currentGis = DEFAULT_GIS;
    let currentNps = DEFAULT_IS_NPS;
    let currentUseAutoDa = true;

    if (cachedDueDa) currentDueDa = Number(cachedDueDa);
    if (cachedDrawnDa) {
      currentDrawnDa = Number(cachedDrawnDa);
    } else {
      currentDrawnDa = getAutoDrawnDaPercent("March 2025", currentDueDa);
    }

    if (cachedDueHra) currentDueHra = Number(cachedDueHra);
    if (cachedDrawnHra) {
      currentDrawnHra = Number(cachedDrawnHra);
    } else {
      currentDrawnHra = getAutoDrawnHraPercent(currentDueHra);
    }

    if (cachedMa) currentMa = Number(cachedMa);
    if (cachedGis) currentGis = Number(cachedGis);
    if (cachedNps) currentNps = cachedNps === 'true';
    if (cachedUseAutoDa) currentUseAutoDa = cachedUseAutoDa === 'true';

    // Wrap state updates in setTimeout to satisfy linter rule against synchronous state sets inside useEffect
    setTimeout(() => {
      if (cachedTeacher) setTeacherInfo(JSON.parse(cachedTeacher));
      setDueDaPercent(currentDueDa);
      setDrawnDaPercent(currentDrawnDa);
      setDueHraPercent(currentDueHra);
      setDrawnHraPercent(currentDrawnHra);
      setMedicalAllowance(currentMa);
      setGisAllowance(currentGis);
      setIsNpsApplicable(currentNps);
      setUseAutoDa(currentUseAutoDa);

      setTeacherCategory(cachedTeacherCategory);
      setInitialDueIndex(Number(cachedInitialDueIndex));
      setInitialDrawnIndex(Number(cachedInitialDrawnIndex));
      setIsDrawnBasicSame(cachedIsDrawnBasicSame === 'true');
      setIncrementMonth(cachedIncrementMonth as "january" | "july" | "none");
      setUseFitmentMatrix(cachedUseFitmentMatrix === 'true');
      
      if (cachedRows) {
        setRows(JSON.parse(cachedRows));
      } else {
        const initialRow = createNewRow(
          "March 2025", 
          31, 
          35400, 
          35400, 
          currentDueDa, 
          currentDrawnDa, 
          currentDueHra, 
          currentDrawnHra, 
          currentMa, 
          currentGis, 
          currentNps, 
          currentUseAutoDa
        );
        setRows([initialRow]);
      }
      const now = new Date();
      const timeString = now.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(timeString);
      setIsMounted(true);
    }, 0);
  }, []);

  // Unified Debounced Auto-save to LocalStorage with visual feedback
  useEffect(() => {
    if (!isMounted) return;

    // Transition to saving state asynchronously to satisfy React cascading render rules
    const savingTimeout = setTimeout(() => {
      setAutoSaveStatus('saving');
    }, 50);

    const delayDebounceFn = setTimeout(() => {
      try {
        localStorage.setItem('arrear_teacher_info', JSON.stringify(teacherInfo));
        localStorage.setItem('arrear_rows', JSON.stringify(rows));
        localStorage.setItem('arrear_teacher_category', teacherCategory);
        localStorage.setItem('arrear_initial_due_index', initialDueIndex.toString());
        localStorage.setItem('arrear_initial_drawn_index', initialDrawnIndex.toString());
        localStorage.setItem('arrear_is_drawn_basic_same', isDrawnBasicSame.toString());
        localStorage.setItem('arrear_increment_month', incrementMonth);
        localStorage.setItem('arrear_use_fitment_matrix', useFitmentMatrix.toString());
        localStorage.setItem('arrear_due_da', dueDaPercent.toString());
        localStorage.setItem('arrear_drawn_da', drawnDaPercent.toString());
        localStorage.setItem('arrear_due_hra', dueHraPercent.toString());
        localStorage.setItem('arrear_drawn_hra', drawnHraPercent.toString());
        localStorage.setItem('arrear_ma', medicalAllowance.toString());
        localStorage.setItem('arrear_gis', gisAllowance.toString());
        localStorage.setItem('arrear_nps', isNpsApplicable.toString());
        localStorage.setItem('arrear_use_auto_da', useAutoDa.toString());

        const now = new Date();
        const timeString = now.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeString);
        setAutoSaveStatus('saved');
      } catch (err) {
        console.error('Error auto-saving:', err);
        setAutoSaveStatus('idle');
      }
    }, 1000); // 1-second debounce to avoid overloading LocalStorage on rapid keystrokes

    return () => {
      clearTimeout(savingTimeout);
      clearTimeout(delayDebounceFn);
    };
  }, [
    teacherInfo,
    rows,
    teacherCategory,
    initialDueIndex,
    initialDrawnIndex,
    isDrawnBasicSame,
    incrementMonth,
    useFitmentMatrix,
    dueDaPercent,
    drawnDaPercent,
    dueHraPercent,
    drawnHraPercent,
    medicalAllowance,
    gisAllowance,
    isNpsApplicable,
    useAutoDa,
    isMounted
  ]);

  // Re-calculate all rows when global settings change
  const handleRecalculateAll = () => {
    const updated = rows.map(row => {
      const activeDueDa = useAutoDa ? getAutoDaPercent(row.month, row.dueDaPercent ?? dueDaPercent) : (row.dueDaPercent ?? dueDaPercent);
      const activeDrawnDa = useAutoDa ? getAutoDrawnDaPercent(row.month, row.drawnDaPercent ?? drawnDaPercent) : (row.drawnDaPercent ?? drawnDaPercent);
      const activeDueHra = row.dueHraPercent ?? dueHraPercent;
      const activeDrawnHra = row.drawnHraPercent ?? drawnHraPercent;

      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = row.days / maxDays;

      const fDueBasic = row.fullDueBasic ?? row.due.basic;
      const fDrawnBasic = row.fullDrawnBasic ?? row.drawn.basic;

      const proratedDueBasic = Math.round(fDueBasic * prorationFactor);
      const proratedDrawnBasic = Math.round(fDrawnBasic * prorationFactor);
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      const due = calculateRowDetails(proratedDueBasic, activeDueDa, activeDueHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.due);
      const drawn = calculateRowDetails(proratedDrawnBasic, activeDrawnDa, activeDrawnHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.drawn);
      const diff = calculateDiffDetails(due, drawn);
      return { 
        ...row, 
        dueDaPercent: activeDueDa,
        drawnDaPercent: activeDrawnDa,
        dueHraPercent: activeDueHra,
        drawnHraPercent: activeDrawnHra,
        due, 
        drawn, 
        diff,
        fullDueBasic: fDueBasic,
        fullDrawnBasic: fDrawnBasic
      };
    });
    setRows(updated);
  };

  const updateExistingRowsWithFitment = (
    activeFitment: boolean,
    category: string,
    dueIndex: number,
    drawnIndex: number,
    drawnSame: boolean,
    incMonth: "january" | "july" | "none"
  ) => {
    if (!activeFitment) return;

    const updated = rows.map(row => {
      const defaultDue = getBasicSalaryForMonth(
        category,
        startMonth,
        startYear,
        dueIndex,
        incMonth,
        row.month
      );
      const defaultDrawn = getBasicSalaryForMonth(
        category,
        startMonth,
        startYear,
        drawnSame ? dueIndex : drawnIndex,
        incMonth,
        row.month
      );

      const activeDueDa = useAutoDa ? getAutoDaPercent(row.month, row.dueDaPercent ?? dueDaPercent) : (row.dueDaPercent ?? dueDaPercent);
      const activeDrawnDa = useAutoDa ? getAutoDrawnDaPercent(row.month, row.drawnDaPercent ?? drawnDaPercent) : (row.drawnDaPercent ?? drawnDaPercent);
      const activeDueHra = row.dueHraPercent ?? dueHraPercent;
      const activeDrawnHra = row.drawnHraPercent ?? drawnHraPercent;

      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = row.days / maxDays;

      const proratedDueBasic = Math.round(defaultDue * prorationFactor);
      const proratedDrawnBasic = Math.round(defaultDrawn * prorationFactor);
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      const due = calculateRowDetails(proratedDueBasic, activeDueDa, activeDueHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.due);
      const drawn = calculateRowDetails(proratedDrawnBasic, activeDrawnDa, activeDrawnHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.drawn);
      const diff = calculateDiffDetails(due, drawn);

      return {
        ...row,
        due,
        drawn,
        diff,
        fullDueBasic: defaultDue,
        fullDrawnBasic: defaultDrawn
      };
    });

    setRows(updated);
  };

  const updateRowField = (
    rowId: string, 
    section: 'due' | 'drawn', 
    field: keyof SalaryDetails, 
    value: number
  ) => {
    const updated = rows.map(row => {
      if (row.id !== rowId) return row;

      const currentOverrides = row.overrides || {};
      const sectionOverrides = currentOverrides[section] || {};

      let updatedOverrides = { ...sectionOverrides };
      const rowDueDa = row.dueDaPercent ?? dueDaPercent;
      const rowDrawnDa = row.drawnDaPercent ?? drawnDaPercent;
      const rowDueHra = row.dueHraPercent ?? dueHraPercent;
      const rowDrawnHra = row.drawnHraPercent ?? drawnHraPercent;

      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = row.days / maxDays;
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      if (field === 'basic') {
        const newBasic = value;
        if (useFitmentMatrix) {
          updatedOverrides = {
            ...updatedOverrides,
            basic: newBasic
          };
          const newOverrides = {
            ...currentOverrides,
            [section]: updatedOverrides
          };
          const due = section === 'due'
            ? calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, newOverrides.due)
            : calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.due);
          const drawn = section === 'drawn'
            ? calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, newOverrides.drawn)
            : calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.drawn);
          const diff = calculateDiffDetails(due, drawn);

          return {
            ...row,
            due,
            drawn,
            diff,
            overrides: newOverrides
          };
        } else {
          const due = section === 'due' 
            ? calculateRowDetails(newBasic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.due) 
            : calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.due);
          const drawn = section === 'drawn' 
            ? calculateRowDetails(newBasic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.drawn) 
            : calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.drawn);
          const diff = calculateDiffDetails(due, drawn);

          return {
            ...row,
            due,
            drawn,
            diff
          };
        }
      } else {
        // Override a non-basic field (like DA, HRA manually)
        updatedOverrides = {
          ...updatedOverrides,
          [field]: value
        };
        
        const newOverrides = {
          ...currentOverrides,
          [section]: updatedOverrides
        };

        const due = section === 'due'
          ? calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, newOverrides.due)
          : calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.due);

        const drawn = section === 'drawn'
          ? calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, newOverrides.drawn)
          : calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, currentOverrides.drawn);

        const diff = calculateDiffDetails(due, drawn);

        return {
          ...row,
          due,
          drawn,
          diff,
          overrides: newOverrides
        };
      }
    });
    setRows(updated);
  };

  const updateRowPercentages = (
    rowId: string, 
    field: 'dueDaPercent' | 'drawnDaPercent' | 'dueHraPercent' | 'drawnHraPercent', 
    value: number
  ) => {
    const updated = rows.map(row => {
      if (row.id !== rowId) return row;
      
      const newDueDaPercent = field === 'dueDaPercent' ? value : (row.dueDaPercent ?? dueDaPercent);
      const newDrawnDaPercent = field === 'drawnDaPercent' ? value : (row.drawnDaPercent ?? drawnDaPercent);
      const newDueHraPercent = field === 'dueHraPercent' ? value : (row.dueHraPercent ?? dueHraPercent);
      const newDrawnHraPercent = field === 'drawnHraPercent' ? value : (row.drawnHraPercent ?? drawnHraPercent);
      
      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = row.days / maxDays;
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      const due = calculateRowDetails(row.due.basic, newDueDaPercent, newDueHraPercent, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.due);
      const drawn = calculateRowDetails(row.drawn.basic, newDrawnDaPercent, newDrawnHraPercent, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.drawn);
      const diff = calculateDiffDetails(due, drawn);
      
      return {
        ...row,
        dueDaPercent: newDueDaPercent,
        drawnDaPercent: newDrawnDaPercent,
        dueHraPercent: newDueHraPercent,
        drawnHraPercent: newDrawnHraPercent,
        due,
        drawn,
        diff
      };
    });
    setRows(updated);
  };

  const clearOverride = (rowId: string, section: 'due' | 'drawn', field: keyof SalaryDetails) => {
    const updated = rows.map(row => {
      if (row.id !== rowId) return row;
      if (!row.overrides || !row.overrides[section]) return row;

      const updatedSectionOverrides = { ...row.overrides[section] };
      delete updatedSectionOverrides[field];

      const updatedOverrides = {
        ...row.overrides,
        [section]: updatedSectionOverrides
      };

      const rowDueDa = row.dueDaPercent ?? dueDaPercent;
      const rowDrawnDa = row.drawnDaPercent ?? drawnDaPercent;
      const rowDueHra = row.dueHraPercent ?? dueHraPercent;
      const rowDrawnHra = row.drawnHraPercent ?? drawnHraPercent;

      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = row.days / maxDays;
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      const due = calculateRowDetails(row.due.basic, rowDueDa, rowDueHra, proratedMedical, proratedGis, isNpsApplicable, updatedOverrides.due);
      const drawn = calculateRowDetails(row.drawn.basic, rowDrawnDa, rowDrawnHra, proratedMedical, proratedGis, isNpsApplicable, updatedOverrides.drawn);
      const diff = calculateDiffDetails(due, drawn);

      return {
        ...row,
        due,
        drawn,
        diff,
        overrides: updatedOverrides
      };
    });
    setRows(updated);
  };

  const updateRowDays = (rowId: string, newDays: number) => {
    const updated = rows.map(row => {
      if (row.id !== rowId) return row;

      const maxDays = getMaxDaysInMonth(row.month);
      const prorationFactor = newDays / maxDays;

      const fDueBasic = row.fullDueBasic ?? row.due.basic;
      const fDrawnBasic = row.fullDrawnBasic ?? row.drawn.basic;

      const proratedDueBasic = Math.round(fDueBasic * prorationFactor);
      const proratedDrawnBasic = Math.round(fDrawnBasic * prorationFactor);
      const proratedMedical = Math.round(medicalAllowance * prorationFactor);
      const proratedGis = Math.round(gisAllowance * prorationFactor);

      const activeDueDa = row.dueDaPercent ?? dueDaPercent;
      const activeDrawnDa = row.drawnDaPercent ?? drawnDaPercent;
      const activeDueHra = row.dueHraPercent ?? dueHraPercent;
      const activeDrawnHra = row.drawnHraPercent ?? drawnHraPercent;

      const due = calculateRowDetails(proratedDueBasic, activeDueDa, activeDueHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.due);
      const drawn = calculateRowDetails(proratedDrawnBasic, activeDrawnDa, activeDrawnHra, proratedMedical, proratedGis, isNpsApplicable, row.overrides?.drawn);
      const diff = calculateDiffDetails(due, drawn);

      return {
        ...row,
        days: newDays,
        due,
        drawn,
        diff,
        fullDueBasic: fDueBasic,
        fullDrawnBasic: fDrawnBasic
      };
    });
    setRows(updated);
  };

  const handleAddSingleRow = () => {
    const lastRow = rows[rows.length - 1];
    let nextMonthName = "April 2025";
    let daysCount = 30;
    let defaultDue = 35400;
    let defaultDrawn = 31200;

    if (lastRow) {
      defaultDue = lastRow.due.basic;
      defaultDrawn = lastRow.drawn.basic;
      // Try parsing month/year to increment
      const match = lastRow.month.match(/^([A-Za-z]+)\s+(\d{4})$/);
      if (match) {
        const mIdx = MONTH_NAMES.indexOf(match[1]);
        const yr = parseInt(match[2], 10);
        if (mIdx !== -1) {
          const nextMIdx = (mIdx + 1) % 12;
          const nextYr = mIdx === 11 ? yr + 1 : yr;
          nextMonthName = `${MONTH_NAMES[nextMIdx]} ${nextYr}`;
          daysCount = new Date(nextYr, nextMIdx + 1, 0).getDate();
        }
      }
    }

    if (useFitmentMatrix) {
      defaultDue = getBasicSalaryForMonth(
        teacherCategory,
        startMonth,
        startYear,
        initialDueIndex,
        incrementMonth,
        nextMonthName
      );
      defaultDrawn = getBasicSalaryForMonth(
        teacherCategory,
        startMonth,
        startYear,
        isDrawnBasicSame ? initialDueIndex : initialDrawnIndex,
        incrementMonth,
        nextMonthName
      );
    }

    const newRow = createNewRow(nextMonthName, daysCount, defaultDue, defaultDrawn, dueDaPercent, drawnDaPercent, dueHraPercent, drawnHraPercent, medicalAllowance, gisAllowance, isNpsApplicable, useAutoDa);
    setRows([...rows, newRow]);
    setExpandedRowId(newRow.id);
  };

  const handleBulkGenerate = () => {
    setShowBulkGenerateModal(true);
  };

  const confirmBulkGenerate = () => {
    const generatedRows: ArrearRow[] = [];
    let currentM = startMonth;
    let currentY = startYear;

    const targetEndM = endMonth;
    const targetEndY = endYear;

    let loopLimit = 0; // Prevent infinite loops
    while ((currentY < targetEndY || (currentY === targetEndY && currentM <= targetEndM)) && loopLimit < 120) {
      loopLimit++;
      const monthName = `${MONTH_NAMES[currentM]} ${currentY}`;
      const daysInM = new Date(currentY, currentM + 1, 0).getDate();
      
      let defaultDue = startDueBasic;
      let defaultDrawn = startDrawnBasic;

      if (useFitmentMatrix) {
        defaultDue = getBasicSalaryForMonth(
          teacherCategory,
          startMonth,
          startYear,
          initialDueIndex,
          incrementMonth,
          monthName
        );
        defaultDrawn = getBasicSalaryForMonth(
          teacherCategory,
          startMonth,
          startYear,
          isDrawnBasicSame ? initialDueIndex : initialDrawnIndex,
          incrementMonth,
          monthName
        );
      }

      generatedRows.push(createNewRow(monthName, daysInM, defaultDue, defaultDrawn, dueDaPercent, drawnDaPercent, dueHraPercent, drawnHraPercent, medicalAllowance, gisAllowance, isNpsApplicable, useAutoDa));

      if (currentM === 11) {
        currentM = 0;
        currentY++;
      } else {
        currentM++;
      }
    }

    if (generatedRows.length > 0) {
      setRows(generatedRows);
      setExpandedRowId(generatedRows[0].id);
    }
    setShowBulkGenerateModal(false);
  };

  const handleDeleteRow = (id: string) => {
    if (rows.length === 1) {
      setShowDeleteErrorModal(true);
      return;
    }
    setRows(rows.filter(r => r.id !== id));
  };

  const handleLoadDemoData = () => {
    setTeacherInfo({
      schoolName: 'UPGRADED HIGH SCHOOL, MUSHAHARI, MUZAFFARPUR',
      teacherName: 'KUMAR JIBENDRA BAHADUR',
      pran: '110098765432',
      designation: 'ASSISTANT TEACHER (BPSC)',
      accountNo: '34059876211',
      blockName: 'MUSHAHARI',
      dateOfJoining: '15-11-2023',
      ifsc: 'SBIN0001234',
    });

    setDueDaPercent(55);
    setDrawnDaPercent(50);
    setDueHraPercent(5);
    setDrawnHraPercent(4);
    setMedicalAllowance(1000);
    setGisAllowance(30);
    setIsNpsApplicable(true);
    setUseAutoDa(true);

    const demoMonths = [
      { month: "January 2025", days: 31, due: 38500, drawn: 35000 },
      { month: "February 2025", days: 28, due: 38500, drawn: 35000 },
      { month: "March 2025", days: 31, due: 40200, drawn: 35000 },
      { month: "April 2025", days: 30, due: 40200, drawn: 35000 },
      { month: "May 2025", days: 31, due: 40200, drawn: 35000 },
    ];

    const generated = demoMonths.map(d => {
      const rowDueDa = getAutoDaPercent(d.month, 55);
      const rowDrawnDa = getAutoDrawnDaPercent(d.month, 50);
      const rowDueHra = 5;
      const rowDrawnHra = 4;
      const due = calculateRowDetails(d.due, rowDueDa, rowDueHra, 1000, 30, true);
      const drawn = calculateRowDetails(d.drawn, rowDrawnDa, rowDrawnHra, 1000, 30, true);
      const diff = calculateDiffDetails(due, drawn);
      return {
        id: Math.random().toString(36).substr(2, 9),
        month: d.month,
        days: d.days,
        dueDaPercent: rowDueDa,
        drawnDaPercent: rowDrawnDa,
        dueHraPercent: rowDueHra,
        drawnHraPercent: rowDrawnHra,
        due,
        drawn,
        diff
      };
    });

    setRows(generated);
    setExpandedRowId(generated[0].id);
  };

  const handleResetAll = () => {
    setShowResetModal(true);
  };

  const confirmResetAll = () => {
    setTeacherInfo({
      schoolName: '',
      teacherName: '',
      pran: '',
      designation: '',
      accountNo: '',
      blockName: '',
      dateOfJoining: '',
      ifsc: '',
    });
    setDueDaPercent(DEFAULT_DUE_DA_PERCENT);
    setDrawnDaPercent(DEFAULT_DRAWN_DA_PERCENT);
    setDueHraPercent(DEFAULT_DUE_HRA_PERCENT);
    setDrawnHraPercent(DEFAULT_DRAWN_HRA_PERCENT);
    setMedicalAllowance(DEFAULT_MA);
    setGisAllowance(DEFAULT_GIS);
    setIsNpsApplicable(DEFAULT_IS_NPS);
    setUseAutoDa(true);
    setStartDueBasic(35400);
    setStartDrawnBasic(35400);
    
    const freshRow = createNewRow(
      "March 2025", 
      31, 
      35400, 
      35400, 
      DEFAULT_DUE_DA_PERCENT, 
      DEFAULT_DRAWN_DA_PERCENT, 
      DEFAULT_DUE_HRA_PERCENT, 
      DEFAULT_DRAWN_HRA_PERCENT, 
      DEFAULT_MA, 
      DEFAULT_GIS, 
      DEFAULT_IS_NPS,
      true
    );
    setRows([freshRow]);
    setExpandedRowId(freshRow.id);
    setShowResetModal(false);
  };

  // Grand Totals Calculations
  const getGrandTotal = (section: 'due' | 'drawn' | 'diff', field: keyof SalaryDetails) => {
    return rows.reduce((sum, row) => sum + row[section][field], 0);
  };

  const grandTotalDiffNet = getGrandTotal('diff', 'net');

  // Group rows by period (Jan-Jun vs Jul-Dec of each year) for multi-page PDF/print output
  const getPageGroups = () => {
    if (pdfPageSplitMode === 'single-page') {
      return [{
        key: 'all',
        label: 'Complete Sheet (पूर्ण अवधि)',
        rows: rows
      }];
    }

    if (pdfPageSplitMode === 'yearly') {
      const groups: { key: string; label: string; rows: typeof rows }[] = [];
      rows.forEach(row => {
        const cleanStr = row.month.trim();
        let year = 2025;
        const yearMatch = cleanStr.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[1], 10);
        }
        const key = `${year}`;
        const label = `January - December ${year}`;
        let g = groups.find(x => x.key === key);
        if (!g) {
          g = { key, label, rows: [] };
          groups.push(g);
        }
        g.rows.push(row);
      });
      return groups.sort((a, b) => a.key.localeCompare(b.key));
    }

    const groups: { key: string; label: string; rows: typeof rows }[] = [];
    rows.forEach(row => {
      const { key, label } = getRowPeriodKey(row.month);
      let g = groups.find(x => x.key === key);
      if (!g) {
        g = { key, label, rows: [] };
        groups.push(g);
      }
      g.rows.push(row);
    });
    // Sort chronologically (by key e.g. "2025-1", "2025-2")
    return groups.sort((a, b) => a.key.localeCompare(b.key));
  };

  // Page Total Calculations for specific 6-month block pages
  const getPageTotal = (groupRows: typeof rows, section: 'due' | 'drawn' | 'diff', field: keyof SalaryDetails) => {
    return groupRows.reduce((sum, row) => sum + row[section][field], 0);
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // PDF direct download using html-to-image & jspdf (multi-page compliant)
  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const { toPng } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');
      
      const pageGroups = getPageGroups();
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 297; // A4 landscape width
      const pageHeight = 210; // A4 landscape height
      
      for (let i = 0; i < pageGroups.length; i++) {
        const pageId = `arrear-sheet-preview-page-${i}`;
        const element = document.getElementById(pageId);
        if (!element) continue;
        
        if (i > 0) {
          pdf.addPage();
        }
        
        const imgData = await toPng(element, {
          pixelRatio: 2.2, // Balance clean resolution and size
          backgroundColor: '#ffffff',
          cacheBust: true,
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, pageHeight);
      }
      
      const filename = `Salary_Arrear_DPO_${(teacherInfo.teacherName || 'Report').replace(/\s+/g, '_')}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setPdfErrorMessage('PDF जनरेट करने में त्रुटि हुई। कृपया "Print Report" बटन का उपयोग करके "Save as PDF" चुनें।');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Excel Export using exceljs (100% client side & perfectly styled)
  const handleExportExcel = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      
      // Helper function to build a sheet with specific rows and a label
      const buildSheet = (worksheet: any, sheetRows: typeof rows, titleLabel: string) => {
        // Enable grid lines
        worksheet.views = [{ showGridLines: true }];
        
        // 1. Title Block
        worksheet.mergeCells('A1:Z1');
        worksheet.getCell('A1').value = 'OFFICE, DPO ESTABLISHMENT MUZAFFARPUR';
        worksheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1E293B' } };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        
        worksheet.mergeCells('A2:Z2');
        worksheet.getCell('A2').value = `SALARY ARREAR PORTAL (${titleLabel})`;
        worksheet.getCell('A2').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF475569' } };
        worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 2. Personal Details
        worksheet.getCell('A4').value = 'NAME OF SCHOOL:';
        worksheet.getCell('A4').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('B4:H4');
        worksheet.getCell('B4').value = teacherInfo.schoolName || '—';
        worksheet.getCell('B4').font = { name: 'Arial', size: 9 };
        
        worksheet.getCell('J4').value = 'BLOCK NAME:';
        worksheet.getCell('J4').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('K4:O4');
        worksheet.getCell('K4').value = teacherInfo.blockName || '—';
        worksheet.getCell('K4').font = { name: 'Arial', size: 9 };
        
        worksheet.getCell('Q4').value = 'DATE OF JOINING:';
        worksheet.getCell('Q4').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('R4:U4');
        worksheet.getCell('R4').value = teacherInfo.dateOfJoining || '—';
        worksheet.getCell('R4').font = { name: 'Arial', size: 9 };
        
        // Row 5
        worksheet.getCell('A5').value = 'NAME OF TEACHER:';
        worksheet.getCell('A5').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('B5:H5');
        worksheet.getCell('B5').value = teacherInfo.teacherName || '—';
        worksheet.getCell('B5').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E3A8A' } };
        
        worksheet.getCell('J5').value = 'DESIGNATION:';
        worksheet.getCell('J5').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('K5:O5');
        worksheet.getCell('K5').value = teacherInfo.designation || '—';
        worksheet.getCell('K5').font = { name: 'Arial', size: 9 };
        
        worksheet.getCell('Q5').value = 'IFSC:';
        worksheet.getCell('Q5').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('R5:U5');
        worksheet.getCell('R5').value = teacherInfo.ifsc || '—';
        worksheet.getCell('R5').font = { name: 'Arial', size: 9 };
        
        // Row 6
        worksheet.getCell('A6').value = 'PRAN NO.:';
        worksheet.getCell('A6').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('B6:H6');
        worksheet.getCell('B6').value = teacherInfo.pran || '—';
        worksheet.getCell('B6').font = { name: 'Arial', size: 9 };
        
        worksheet.getCell('J6').value = 'ACCOUNT NO.:';
        worksheet.getCell('J6').font = { bold: true, name: 'Arial', size: 9 };
        worksheet.mergeCells('K6:O6');
        worksheet.getCell('K6').value = teacherInfo.accountNo || '—';
        worksheet.getCell('K6').font = { name: 'Arial', size: 9 };
        
        // Style all meta fields with a subtle background and borders
        const metaRows = [4, 5, 6];
        metaRows.forEach(r => {
          worksheet.getRow(r).height = 20;
          for (let col = 1; col <= 26; col++) {
            const cell = worksheet.getCell(r, col);
            cell.alignment = { vertical: 'middle' };
          }
        });
        
        // 3. Table Headers (Row 8 & Row 9)
        worksheet.mergeCells('A8:A9');
        worksheet.getCell('A8').value = 'MONTH';
        worksheet.mergeCells('B8:B9');
        worksheet.getCell('B8').value = 'No of Days';
        
        worksheet.mergeCells('C8:J8');
        worksheet.getCell('C8').value = 'DUE';
        worksheet.mergeCells('K8:R8');
        worksheet.getCell('K8').value = 'DRAWN';
        worksheet.mergeCells('S8:Z8');
        worksheet.getCell('S8').value = 'DIFFERENCE';
        
        const subHeaders = [
          'Basic Pay', 'D.A.', 'H.R.A.', 'M.A.', 'GROSS PAY', 'NPS', 'GIS', 'NET PAY', // DUE
          'Basic Pay', 'D.A.', 'H.R.A.', 'M.A.', 'GROSS PAY', 'NPS', 'GIS', 'NET PAY', // DRAWN
          'Basic Pay', 'D.A.', 'H.R.A.', 'M.A.', 'GROSS PAY', 'NPS', 'GIS', 'NET PAY'  // DIFFERENCE
        ];
        subHeaders.forEach((sh, idx) => {
          worksheet.getCell(9, idx + 3).value = sh;
        });
        
        // Row Heights
        worksheet.getRow(8).height = 24;
        worksheet.getRow(9).height = 22;
        
        // Color Styles
        const applyHeaderStyle = (cell: any, bgColor: string) => {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF' + bgColor }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        };
        
        // Apply main headers
        applyHeaderStyle(worksheet.getCell('A8'), '475569');
        applyHeaderStyle(worksheet.getCell('B8'), '475569');
        applyHeaderStyle(worksheet.getCell('C8'), '059669');
        applyHeaderStyle(worksheet.getCell('K8'), '4F46E5');
        applyHeaderStyle(worksheet.getCell('S8'), 'D97706');
        
        // Apply subheaders
        for (let c = 3; c <= 10; c++) applyHeaderStyle(worksheet.getCell(9, c), '10B981'); // Emerald tint
        for (let c = 11; c <= 18; c++) applyHeaderStyle(worksheet.getCell(9, c), '6366F1'); // Indigo tint
        for (let c = 19; c <= 26; c++) applyHeaderStyle(worksheet.getCell(9, c), 'F59E0B'); // Amber tint
        
        // 4. Data Rows
        let currentIdx = 10;
        sheetRows.forEach(row => {
          const vals = [
            row.month,
            row.days,
            
            row.due.basic,
            row.due.da,
            row.due.hra,
            row.due.ma,
            row.due.gross,
            row.due.nps,
            row.due.gis,
            row.due.net,
            
            row.drawn.basic,
            row.drawn.da,
            row.drawn.hra,
            row.drawn.ma,
            row.drawn.gross,
            row.drawn.nps,
            row.drawn.gis,
            row.drawn.net,
            
            row.diff.basic,
            row.diff.da,
            row.diff.hra,
            row.diff.ma,
            row.diff.gross,
            row.diff.nps,
            row.diff.gis,
            row.diff.net
          ];
          
          worksheet.addRow(vals);
          const rObj = worksheet.getRow(currentIdx);
          rObj.height = 20;
          
          rObj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
          rObj.getCell(1).font = { name: 'Arial', size: 9, bold: true };
          rObj.getCell(2).font = { name: 'Arial', size: 9 };
          
          for (let col = 3; col <= 26; col++) {
            const cell = rObj.getCell(col);
            cell.numFormat = '#,##0';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.font = { name: 'Arial', size: 9 };
            
            // Background color and borders
            if (col <= 10) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; // Soft light green
            } else if (col <= 18) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }; // Soft light purple
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF6E2' } }; // Soft light amber
              if (col === 26) {
                cell.font = { name: 'Arial', size: 9, bold: true };
              }
            }
            
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          }
          currentIdx++;
        });
        
        // 5. Total Row
        const totalIdx = currentIdx;
        worksheet.addRow([]);
        const totalRowObj = worksheet.getRow(totalIdx);
        totalRowObj.height = 22;
        
        worksheet.mergeCells(`A${totalIdx}:B${totalIdx}`);
        worksheet.getCell(`A${totalIdx}`).value = 'GRAND TOTAL';
        worksheet.getCell(`A${totalIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell(`A${totalIdx}`).font = { name: 'Arial', size: 9, bold: true };
        
        for (let col = 3; col <= 26; col++) {
          const cell = totalRowObj.getCell(col);
          const colLetter = String.fromCharCode(64 + col);
          cell.value = { formula: `=SUM(${colLetter}10:${colLetter}${totalIdx - 1})` };
          cell.numFormat = '#,##0';
          cell.font = { name: 'Arial', size: 9, bold: true };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          
          if (col <= 10) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light green
          } else if (col <= 18) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Light indigo
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } }; // Light amber
          }
          
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'double', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        }
        
        // 6. Words Row
        const wordsIdx = totalIdx + 1;
        worksheet.addRow([]);
        const wordsRowObj = worksheet.getRow(wordsIdx);
        wordsRowObj.height = 24;
        
        worksheet.mergeCells(`A${wordsIdx}:Z${wordsIdx}`);
        const totalNetDiffVal = sheetRows.reduce((sum, r) => sum + r.diff.net, 0);
        const words = convertNumberToWords(totalNetDiffVal);
        
        const wordCell = worksheet.getCell(`A${wordsIdx}`);
        wordCell.value = `GRAND TOTAL IN WORDS (कुल महायोग शब्दों में): ${words}`;
        wordCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        wordCell.alignment = { horizontal: 'left', vertical: 'middle' };
        wordCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        wordCell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        
        // 7. Signature lines
        const sigIdx2 = wordsIdx + 3;
        worksheet.addRow([]); // Blank
        worksheet.addRow([]); // Blank
        worksheet.addRow([]); // Blank for signatures
        
        worksheet.mergeCells(`A${sigIdx2}:E${sigIdx2}`);
        worksheet.getCell(`A${sigIdx2}`).value = 'Signature of Teacher\n(शिक्षक के हस्ताक्षर)';
        worksheet.getCell(`A${sigIdx2}`).font = { name: 'Arial', size: 9, bold: true };
        worksheet.getCell(`A${sigIdx2}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        
        worksheet.mergeCells(`J${sigIdx2}:N${sigIdx2}`);
        worksheet.getCell(`J${sigIdx2}`).value = 'Signature of Headmaster\n(प्रधानाध्यापक के हस्ताक्षर)';
        worksheet.getCell(`J${sigIdx2}`).font = { name: 'Arial', size: 9, bold: true };
        worksheet.getCell(`J${sigIdx2}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        
        worksheet.mergeCells(`T${sigIdx2}:Z${sigIdx2}`);
        worksheet.getCell(`T${sigIdx2}`).value = 'Counter Signed by B.E.O.\n(प्रखंड शिक्षा पदाधिकारी के प्रतिहस्ताक्षर)';
        worksheet.getCell(`T${sigIdx2}`).font = { name: 'Arial', size: 9, bold: true };
        worksheet.getCell(`T${sigIdx2}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        
        worksheet.getRow(sigIdx2).height = 40;
        
        // Adjust column widths individually
        worksheet.getColumn(1).width = 16; // Month
        worksheet.getColumn(2).width = 11; // No of Days
        for (let col = 3; col <= 26; col++) {
          worksheet.getColumn(col).width = 12.5;
        }
      };
      
      // Add Consolidated Sheet
      const consolidatedSheet = workbook.addWorksheet('Consolidated Arrear');
      buildSheet(consolidatedSheet, rows, 'Consolidated');
      
      // Add additional sheets for page blocks if we have multiple page groups
      const pageGroups = getPageGroups();
      if (pageGroups.length > 1) {
        pageGroups.forEach((group, groupIdx) => {
          const sheetName = `Page ${groupIdx + 1} (${group.label})`;
          // Excel sheet names have a limit of 31 characters and cannot contain certain characters like : / ? * [ ]
          const sanitizedSheetName = sheetName
            .replace(/[:/?*\[\]]/g, '')
            .substring(0, 31);
          const blockSheet = workbook.addWorksheet(sanitizedSheetName);
          buildSheet(blockSheet, group.rows, group.label);
        });
      }
      
      // Save
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const teacherNameClean = (teacherInfo.teacherName || 'Report').replace(/\s+/g, '_');
      anchor.download = `Salary_Arrear_DPO_${teacherNameClean}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Excel फाइल डाउनलोड करने में असमर्थ। कृपया पुनः प्रयास करें।');
    }
  };

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500 font-mono text-sm">
        प्रोग्राम लोड हो रहा है, कृपया प्रतीक्षा करें...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Web Header / Navbar (Clean Minimalism Style, Hidden during Print) */}
      <nav className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900">Salary Arrear Portal</span>
          <span className="hidden sm:inline-block text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded font-medium border border-slate-200">
            DPO Establishment Muzaffarpur
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Beautiful real-time Auto-save Badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] sm:text-xs select-none shadow-sm">
            {autoSaveStatus === 'saving' ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                </span>
                <span className="font-semibold text-amber-600 animate-pulse">सहेज रहा है (Saving...)</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-semibold text-emerald-700 hidden sm:inline">स्वतः सुरक्षित (Auto-Saved)</span>
                <span className="font-semibold text-emerald-700 sm:hidden">सहेजा गया</span>
                {lastSavedTime && (
                  <span className="text-slate-400 font-mono text-[9px] sm:text-[10px] border-l border-slate-200 pl-1.5 ml-1">
                    {lastSavedTime}
                  </span>
                )}
              </>
            )}
          </div>

          <button
            onClick={handleLoadDemoData}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors shadow-sm cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Demo डाटा
          </button>
          <button
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            रीसेट करें
          </button>
        </div>
      </nav>

      {/* Main Workspace (Bento Grid split) */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Interactive Input Editors (Hidden during print) */}
        <section id="editor-pane" className="no-print w-full lg:w-[42%] flex flex-col gap-5">
          
          {/* Quick-tips Notification */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 text-xs text-slate-600 flex gap-3 shadow-sm">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">💡 महत्वपूर्ण सुझाव (Important Guide)</p>
              <p className="mt-1.5 leading-relaxed text-slate-500">
                यह पोर्टल बिहार सरकार के डी.पी.ओ. स्थापना मुजफ्फरपुर के आधिकारिक सैलरी एरियर प्रारूप के अनुसार कार्य करता है। 
                बाएं हाथ पर डाटा डालें, दाहिने हाथ पर तत्काल प्रिंट-रेडी शीट देखें। <b>Direct PDF</b> डाउनलोड करें या उच्च गुणवत्ता के लिए <b>Print</b> बटन दबाकर <i>Save as PDF</i> चुनें।
              </p>
            </div>
          </div>

          {/* Tab 1: Teacher Category & Fitment Pay (Fitment Matrix) */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                  <Award className="w-4 h-4" />
                </span>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">१. शिक्षक श्रेणी एवं फिटमेंट वेतन (Teacher Category & Fitment Pay)</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">स्वचालित वेतन (Auto Matrix)</span>
                <input
                  type="checkbox"
                  id="use-fitment-chk"
                  checked={useFitmentMatrix}
                  onChange={e => {
                    const checked = e.target.checked;
                    setUseFitmentMatrix(checked);
                    if (checked) {
                      const dueBasicVal = FITMENT_MATRIX[teacherCategory]?.[initialDueIndex - 1] || 25000;
                      const drawnBasicVal = isDrawnBasicSame
                        ? dueBasicVal
                        : (FITMENT_MATRIX[teacherCategory]?.[initialDrawnIndex - 1] || 25000);
                      setStartDueBasic(dueBasicVal);
                      setStartDrawnBasic(drawnBasicVal);
                    }
                    updateExistingRowsWithFitment(checked, teacherCategory, initialDueIndex, initialDrawnIndex, isDrawnBasicSame, incrementMonth);
                  }}
                  className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {useFitmentMatrix ? (
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-emerald-50/40 rounded-lg p-3 text-[11px] text-emerald-900 border border-emerald-100/30">
                  <p className="font-semibold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    फिटमेंट मैट्रिक्स वेतनमान सक्रिय (Fitment Matrix Salary Active)
                  </p>
                  <p className="text-slate-500 text-[10px] mt-1 leading-relaxed">
                    यह विकल्प बिहार सरकार के <b>अनुलग्नक-क (Anulagnak-K)</b> फिटमेंट तालिका के अनुसार वार्षिक 3% वेतन वृद्धि (Increment) को जनवरी अथवा जुलाई महीने में स्वतः गणना कर लेता है।
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category Select */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">शिक्षक की श्रेणी (Category of Teacher)</label>
                    <select
                      value={teacherCategory}
                      onChange={e => {
                        const newCat = e.target.value;
                        setTeacherCategory(newCat);
                        const dueBasicVal = FITMENT_MATRIX[newCat]?.[initialDueIndex - 1] || 25000;
                        const drawnBasicVal = isDrawnBasicSame
                          ? dueBasicVal
                          : (FITMENT_MATRIX[newCat]?.[initialDrawnIndex - 1] || 25000);
                        setStartDueBasic(dueBasicVal);
                        setStartDrawnBasic(drawnBasicVal);
                        updateExistingRowsWithFitment(useFitmentMatrix, newCat, initialDueIndex, initialDrawnIndex, isDrawnBasicSame, incrementMonth);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {Object.keys(FITMENT_MATRIX).map(cat => (
                        <option key={cat} value={cat}>
                          {cat === "I-V" && "प्राथमिक शिक्षक (Class I-V)"}
                          {cat === "VI-VIII" && "मध्य विद्यालय शिक्षक (Class VI-VIII)"}
                          {cat === "वरीय VI-VIII" && "वरीय मध्य शिक्षक (Senior VI-VIII)"}
                          {cat === "IX-X" && "माध्यमिक शिक्षक (Class IX-X)"}
                          {cat === "XI-XII" && "उच्च माध्यमिक शिक्षक (Class XI-XII)"}
                          {cat === "वरीय XI-XII" && "वरीय उच्च माध्यमिक (Senior XI-XII)"}
                          {!["I-V", "VI-VIII", "वरीय VI-VIII", "IX-X", "XI-XII", "वरीय XI-XII"].includes(cat) && cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Increment Month Selector */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">वेतन वृद्धि का महीना (Annual Increment Month)</label>
                    <select
                      value={incrementMonth}
                      onChange={e => {
                        const newInc = e.target.value as any;
                        setIncrementMonth(newInc);
                        updateExistingRowsWithFitment(useFitmentMatrix, teacherCategory, initialDueIndex, initialDrawnIndex, isDrawnBasicSame, newInc);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="july">जुलाई (July Increment)</option>
                      <option value="january">जनवरी (January Increment)</option>
                      <option value="none">कोई नहीं (No Increment)</option>
                    </select>
                  </div>

                  {/* Due Initial Index (Level) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">देय प्रारंभिक सूचकांक (Due Initial Level 1-20)</label>
                    <select
                      value={initialDueIndex}
                      onChange={e => {
                        const newLvl = Number(e.target.value);
                        setInitialDueIndex(newLvl);
                        const dueBasicVal = FITMENT_MATRIX[teacherCategory]?.[newLvl - 1] || 25000;
                        setStartDueBasic(dueBasicVal);
                        if (isDrawnBasicSame) {
                          setStartDrawnBasic(dueBasicVal);
                        }
                        updateExistingRowsWithFitment(useFitmentMatrix, teacherCategory, newLvl, initialDrawnIndex, isDrawnBasicSame, incrementMonth);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                    >
                      {Array.from({ length: 20 }, (_, i) => i + 1).map(lvl => {
                        const amt = FITMENT_MATRIX[teacherCategory]?.[lvl - 1] || 0;
                        return (
                          <option key={`due-lvl-${lvl}`} value={lvl}>
                            सूचकांक (Level) {lvl} - ₹{amt.toLocaleString()}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Same Drawn Checkbox */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">प्राप्त मूल वेतन सूचकांक (Drawn Basic Level)</label>
                    <div className="flex items-center gap-1.5 py-2">
                      <input
                        type="checkbox"
                        id="is-drawn-same-chk"
                        checked={isDrawnBasicSame}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsDrawnBasicSame(checked);
                          const dueBasicVal = FITMENT_MATRIX[teacherCategory]?.[initialDueIndex - 1] || 25000;
                          const drawnBasicVal = checked
                            ? dueBasicVal
                            : (FITMENT_MATRIX[teacherCategory]?.[initialDrawnIndex - 1] || 25000);
                          setStartDrawnBasic(drawnBasicVal);
                          updateExistingRowsWithFitment(useFitmentMatrix, teacherCategory, initialDueIndex, initialDrawnIndex, checked, incrementMonth);
                        }}
                        className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                      />
                      <label htmlFor="is-drawn-same-chk" className="text-[11px] text-slate-600 font-medium cursor-pointer">
                        देय वेतन के समान (Same as Due Level)
                      </label>
                    </div>
                  </div>

                  {/* Drawn Initial Index (Level) - rendered only if not same */}
                  {!isDrawnBasicSame && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-1 animate-fadeIn">
                      <label className="text-xs font-semibold text-slate-700">प्राप्त प्रारंभिक सूचकांक (Drawn Initial Level 1-20)</label>
                      <select
                        value={initialDrawnIndex}
                        onChange={e => {
                          const newLvl = Number(e.target.value);
                          setInitialDrawnIndex(newLvl);
                          const drawnBasicVal = FITMENT_MATRIX[teacherCategory]?.[newLvl - 1] || 25000;
                          setStartDrawnBasic(drawnBasicVal);
                          updateExistingRowsWithFitment(useFitmentMatrix, teacherCategory, initialDueIndex, newLvl, isDrawnBasicSame, incrementMonth);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                      >
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(lvl => {
                          const amt = FITMENT_MATRIX[teacherCategory]?.[lvl - 1] || 0;
                          return (
                            <option key={`drawn-lvl-${lvl}`} value={lvl}>
                              सूचकांक (Level) {lvl} - ₹{amt.toLocaleString()}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                  <span>प्रारंभिक मूल वेतन (Starting Basic):</span>
                  <div className="flex gap-4">
                    <span>देय (Due): <b className="text-indigo-600 font-mono">₹{(FITMENT_MATRIX[teacherCategory]?.[initialDueIndex - 1] || 0).toLocaleString()}</b></span>
                    <span>प्राप्त (Drawn): <b className="text-amber-600 font-mono">₹{(FITMENT_MATRIX[teacherCategory]?.[(isDrawnBasicSame ? initialDueIndex : initialDrawnIndex) - 1] || 0).toLocaleString()}</b></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-lg p-4 text-center text-xs text-slate-500 animate-fadeIn">
                <p>स्वचालित फिटमेंट वेतन मैट्रिक्स बंद है। (Fitment Matrix is inactive)</p>
                <p className="text-[10px] text-slate-400 mt-1">आप सभी महीनों में मूल वेतन (Basic Pay) स्वयं टाइप कर सकते हैं। इसे सक्रिय करने हेतु ऊपर दाहिने कोने में टिक करें।</p>
              </div>
            )}
          </div>

          {/* Tab 2: Teacher & School Personal Details */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                <Settings className="w-4 h-4" />
              </span>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">२. कर्मचारी एवं विद्यालय का विवरण (Personal Details)</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">विद्यालय का नाम (School Name)</label>
                <input
                  type="text"
                  value={teacherInfo.schoolName}
                  onChange={e => setTeacherInfo({ ...teacherInfo, schoolName: e.target.value.toUpperCase() })}
                  placeholder="E.G. HMS SCHOOL, MUZAFFARPUR"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">शिक्षक का नाम (Teacher Name)</label>
                <input
                  type="text"
                  value={teacherInfo.teacherName}
                  onChange={e => setTeacherInfo({ ...teacherInfo, teacherName: e.target.value.toUpperCase() })}
                  placeholder="E.G. RAJESH KUMAR"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">PRAN नंबर</label>
                <input
                  type="text"
                  value={teacherInfo.pran}
                  onChange={e => setTeacherInfo({ ...teacherInfo, pran: e.target.value })}
                  placeholder="12 DIGIT PRAN NO."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">पदनाम (Designation)</label>
                <input
                  type="text"
                  value={teacherInfo.designation}
                  onChange={e => setTeacherInfo({ ...teacherInfo, designation: e.target.value.toUpperCase() })}
                  placeholder="ASSISTANT TEACHER"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">खाता संख्या (Account No.)</label>
                <input
                  type="text"
                  value={teacherInfo.accountNo}
                  onChange={e => setTeacherInfo({ ...teacherInfo, accountNo: e.target.value })}
                  placeholder="BANK ACCOUNT NUMBER"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">प्रखंड का नाम (Block Name)</label>
                <input
                  type="text"
                  value={teacherInfo.blockName}
                  onChange={e => setTeacherInfo({ ...teacherInfo, blockName: e.target.value.toUpperCase() })}
                  placeholder="E.G. MUSHAHARI"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">योगदान तिथि (Date of Joining)</label>
                <input
                  type="text"
                  value={teacherInfo.dateOfJoining}
                  onChange={e => setTeacherInfo({ ...teacherInfo, dateOfJoining: e.target.value })}
                  placeholder="DD-MM-YYYY"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">IFSC कोड</label>
                <input
                  type="text"
                  value={teacherInfo.ifsc}
                  onChange={e => setTeacherInfo({ ...teacherInfo, ifsc: e.target.value.toUpperCase() })}
                  placeholder="IFSC CODE"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Tab 3: Global Configuration Parameters */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between font-semibold text-xs text-slate-400 uppercase tracking-widest focus:outline-none cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                  <Settings className="w-4 h-4" />
                </span>
                <span>३. गणना पैरामीटर सेटिंग्स (Global Formula Settings)</span>
              </div>
              {showConfig ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showConfig && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 animate-fadeIn">
                
                {/* Dynamic DA % Selector Section */}
                <div className="col-span-2 flex flex-col gap-1.5 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">१. Dearness Allowance (DA %)</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">बिहार सरकार मानक (Bihar Gov Slabs)</span>
                      <input
                        type="checkbox"
                        id="use-auto-da-chk"
                        checked={useAutoDa}
                        onChange={e => setUseAutoDa(e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  {useAutoDa ? (
                    <div className="bg-indigo-50/50 rounded-lg p-3 text-[10px] text-indigo-950 flex flex-col gap-1.5 border border-indigo-100/30">
                      <div className="font-semibold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        स्वचालित दरें लागू (Month-wise Auto DA% is Active):
                      </div>
                      <div className="text-slate-600 leading-normal pt-1 text-center font-semibold overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="border-b border-indigo-100">
                              <th className="py-1 text-slate-400 font-normal">अवधि (Period)</th>
                              <th className="py-1 text-indigo-600 font-semibold">देय दर (Due DA %)</th>
                              <th className="py-1 text-amber-600 font-semibold">प्राप्त दर (Drawn DA %)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-indigo-50/30">
                              <td className="py-1 text-slate-500">Jan 2024 - June 2024</td>
                              <td className="py-1 text-indigo-600 font-mono">50%</td>
                              <td className="py-1 text-amber-600 font-mono">46%</td>
                            </tr>
                            <tr className="border-b border-indigo-50/30">
                              <td className="py-1 text-slate-500">July 2024 - Dec 2024</td>
                              <td className="py-1 text-indigo-600 font-mono">53%</td>
                              <td className="py-1 text-amber-600 font-mono">50%</td>
                            </tr>
                            <tr className="border-b border-indigo-50/30">
                              <td className="py-1 text-slate-500">Jan 2025 - June 2025</td>
                              <td className="py-1 text-indigo-600 font-mono">55%</td>
                              <td className="py-1 text-amber-600 font-mono">50% (Slabs Match)</td>
                            </tr>
                            <tr className="border-b border-indigo-50/30">
                              <td className="py-1 text-slate-500">July 2025 - Dec 2025</td>
                              <td className="py-1 text-indigo-600 font-mono">58%</td>
                              <td className="py-1 text-amber-600 font-mono">53%</td>
                            </tr>
                            <tr>
                              <td className="py-1 text-slate-500">Jan 2026 onwards</td>
                              <td className="py-1 text-indigo-600 font-mono">60%</td>
                              <td className="py-1 text-amber-600 font-mono">55%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[9px] text-slate-400 italic mt-1">गणना संबंधित महीने के अनुसार स्वतः ही सही देय (Due) और प्राप्त (Drawn) दर का चयन कर लेगी। इससे मैन्युअल टाइपिंग की आवश्यकता नहीं होगी।</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">डिफ़ॉल्ट देय दर (Due DA)</span>
                        <div className="flex gap-1 items-center">
                          <input
                            type="number"
                            value={dueDaPercent === 0 ? "" : dueDaPercent}
                            onChange={e => setDueDaPercent(Math.max(0, Number(e.target.value)))}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-right focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-xs font-semibold text-slate-400">%</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">डिफ़ॉल्ट प्राप्त दर (Drawn DA)</span>
                        <div className="flex gap-1 items-center">
                          <input
                            type="number"
                            value={drawnDaPercent === 0 ? "" : drawnDaPercent}
                            onChange={e => setDrawnDaPercent(Math.max(0, Number(e.target.value)))}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-right focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-xs font-semibold text-slate-400">%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Town-to-Town HRA Selection Section */}
                <div className="col-span-2 flex flex-col gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">२. House Rent Allowance (HRA %)</label>
                    <span className="text-[10px] text-slate-400">बिहार शहर/नगर श्रेणी (Bihar HRA Slabs)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Due HRA */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-indigo-600">देय HRA % (Due HRA)</span>
                      <div className="grid grid-cols-5 gap-1 text-[10px]">
                        {[4, 5, 7.5, 10, 20].map((rate) => (
                          <button
                            key={`due-hra-${rate}`}
                            type="button"
                            onClick={() => setDueHraPercent(rate)}
                            className={`py-1 rounded border font-semibold text-center transition-all cursor-pointer ${
                              dueHraPercent === rate
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 justify-between bg-slate-50 p-1.5 rounded border border-slate-100">
                        <span className="text-[9px] text-slate-400 truncate">
                          {dueHraPercent === 4 && "ग्रामीण / Rural"}
                          {dueHraPercent === 5 && "संशोधित ग्रामीण / Rural"}
                          {dueHraPercent === 7.5 && "नगर परिषद / Small Town"}
                          {dueHraPercent === 10 && "मुख्यालय / District HQ"}
                          {dueHraPercent === 20 && "पटना / Patna"}
                          {!([4, 5, 7.5, 10, 20].includes(dueHraPercent)) && "Custom"}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={dueHraPercent === 0 ? "" : dueHraPercent}
                            onChange={e => setDueHraPercent(Math.max(0, Number(e.target.value)))}
                            className="w-10 px-1 py-0.5 text-center text-[10px] border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-[9px] text-slate-400 font-semibold">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Drawn HRA */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-amber-600">प्राप्त HRA % (Drawn HRA)</span>
                      <div className="grid grid-cols-5 gap-1 text-[10px]">
                        {[4, 5, 7.5, 10, 20].map((rate) => (
                          <button
                            key={`drawn-hra-${rate}`}
                            type="button"
                            onClick={() => setDrawnHraPercent(rate)}
                            className={`py-1 rounded border font-semibold text-center transition-all cursor-pointer ${
                              drawnHraPercent === rate
                                ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 justify-between bg-slate-50 p-1.5 rounded border border-slate-100">
                        <span className="text-[9px] text-slate-400 truncate">
                          {drawnHraPercent === 4 && "ग्रामीण / Rural"}
                          {drawnHraPercent === 5 && "संशोधित ग्रामीण / Rural"}
                          {drawnHraPercent === 7.5 && "नगर परिषद / Small Town"}
                          {drawnHraPercent === 10 && "मुख्यालय / District HQ"}
                          {drawnHraPercent === 20 && "पटना / Patna"}
                          {!([4, 5, 7.5, 10, 20].includes(drawnHraPercent)) && "Custom"}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={drawnHraPercent === 0 ? "" : drawnHraPercent}
                            onChange={e => setDrawnHraPercent(Math.max(0, Number(e.target.value)))}
                            className="w-10 px-1 py-0.5 text-center text-[10px] border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-[9px] text-slate-400 font-semibold">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-700">Medical Allowance (MA)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={medicalAllowance === 0 ? "" : medicalAllowance}
                      onChange={e => setMedicalAllowance(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-xs self-center font-semibold text-slate-400">Rs</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-700">Group Insurance (GIS)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={gisAllowance === 0 ? "" : gisAllowance}
                      onChange={e => setGisAllowance(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-xs self-center font-semibold text-slate-400">Rs</span>
                  </div>
                </div>

                <div className="col-span-2 flex items-center justify-between py-2 border-t border-slate-100 mt-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-700">NPS कटौती लागू करें?</span>
                    <span className="text-[10px] text-slate-400">10% of (Basic Pay + DA) for NPS subscribers</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isNpsApplicable}
                    onChange={e => setIsNpsApplicable(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRecalculateAll}
                  className="col-span-2 mt-2 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  सभी पंक्तियों को नया फॉर्मूला से अपडेट करें (Recalculate)
                </button>
              </div>
            )}
          </div>

          {/* Tab 4: Month Range Generator */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                <Calendar className="w-4 h-4" />
              </span>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">४. रेंज मंथ जनरेटर (Bulk Month Generator)</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">प्रारंभ महीना (Start Month)</label>
                <div className="flex gap-1.5">
                  <select
                    value={startMonth}
                    onChange={e => setStartMonth(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {MONTH_NAMES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
                  </select>
                  <select
                    value={startYear}
                    onChange={e => setStartYear(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">समाप्ति महीना (End Month)</label>
                <div className="flex gap-1.5">
                  <select
                    value={endMonth}
                    onChange={e => setEndMonth(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {MONTH_NAMES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
                  </select>
                  <select
                    value={endYear}
                    onChange={e => setEndYear(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Starting Basic Pay Input */}
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">प्रारंभिक मूल वेतन (Start Basic Pay)</label>
                <input
                  type="number"
                  value={startDueBasic === 0 ? "" : startDueBasic}
                  onChange={e => {
                    const val = Math.max(0, Number(e.target.value));
                    setStartDueBasic(val);
                    setStartDrawnBasic(val);
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-right"
                />
              </div>

              <button
                type="button"
                onClick={handleBulkGenerate}
                className="col-span-2 mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                थोक में महीना रेंज बनाएं (Generate Batch Rows)
              </button>
            </div>
          </div>

          {/* Tab 5: Month-wise Salary Inputs (Interactive List) */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex-1 flex flex-col min-h-[450px]">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                  <Plus className="w-4 h-4" />
                </span>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">५. मासिक वेतन डाटा फीड (Month-wise Salary Entry)</h2>
              </div>
              <button
                type="button"
                onClick={handleAddSingleRow}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                महीना जोड़ें
              </button>
            </div>

            {/* List of Months */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[500px]">
              {rows.map((row, idx) => {
                const isExpanded = expandedRowId === row.id;
                return (
                  <div 
                    key={row.id}
                    className={`border rounded transition-all ${
                      isExpanded 
                        ? 'border-indigo-500 bg-slate-50/50 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Header Row */}
                    <div 
                      onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-400 w-5">#{idx + 1}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{row.month}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{row.days} Days • Net Diff: ₹{row.diff.net.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                     {/* Expandable Details Form */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-200 flex flex-col gap-4 animate-fadeIn">
                        
                        {/* Month Info Customizer */}
                        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Month Header</label>
                            <input
                              type="text"
                              value={row.month}
                              onChange={e => {
                                const updated = rows.map(r => r.id === row.id ? { ...r, month: e.target.value } : r);
                                setRows(updated);
                              }}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">No. of Days</label>
                            <input
                              type="number"
                              value={row.days === 0 ? "" : row.days}
                              onChange={e => {
                                updateRowDays(row.id, Math.max(0, Number(e.target.value)));
                              }}
                              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white font-medium text-center focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Month-Specific DA% & HRA% Override Panel */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-indigo-50/30 rounded-lg border border-indigo-100/40">
                          {/* Due Overrides */}
                          <div className="flex flex-col gap-2 bg-white p-2.5 rounded border border-indigo-50/50">
                            <p className="text-[10px] font-bold text-indigo-600 flex justify-between items-center border-b border-indigo-50/50 pb-1">
                              <span>देय दरें (Due Rates Override)</span>
                              <span className="text-[8px] text-slate-400">Gov auto: {getAutoDaPercent(row.month, dueDaPercent)}%</span>
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <label className="block text-slate-500 mb-0.5 font-medium">Due DA %</label>
                                <div className="flex gap-1 items-center">
                                  <input
                                    type="number"
                                    step="1"
                                    value={(row.dueDaPercent ?? dueDaPercent) === 0 ? "" : (row.dueDaPercent ?? dueDaPercent)}
                                    onChange={e => updateRowPercentages(row.id, 'dueDaPercent', Math.max(0, Number(e.target.value)))}
                                    className="w-full px-2 py-0.5 text-xs font-mono border border-slate-300 rounded bg-white text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                  />
                                  <span className="font-semibold text-slate-400">%</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-slate-500 mb-0.5 font-medium">Due HRA %</label>
                                <div className="flex gap-1 items-center">
                                  <select
                                    value={row.dueHraPercent ?? dueHraPercent}
                                    onChange={e => updateRowPercentages(row.id, 'dueHraPercent', Number(e.target.value))}
                                    className="w-full px-1 py-0.5 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                  >
                                    <option value="4">4%</option>
                                    <option value="5">5%</option>
                                    <option value="7.5">7.5%</option>
                                    <option value="10">10%</option>
                                    <option value="20">20%</option>
                                    {![4, 5, 7.5, 10, 20].includes(row.dueHraPercent ?? dueHraPercent) && (
                                      <option value={row.dueHraPercent ?? dueHraPercent}>{(row.dueHraPercent ?? dueHraPercent)}%</option>
                                    )}
                                  </select>
                                  <span className="font-semibold text-slate-400">%</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Drawn Overrides */}
                          <div className="flex flex-col gap-2 bg-white p-2.5 rounded border border-indigo-50/50">
                            <p className="text-[10px] font-bold text-amber-600 flex justify-between items-center border-b border-indigo-50/50 pb-1">
                              <span>प्राप्त दरें (Drawn Rates Override)</span>
                              <span className="text-[8px] text-slate-400">Gov auto: {getAutoDrawnDaPercent(row.month, drawnDaPercent)}%</span>
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <label className="block text-slate-500 mb-0.5 font-medium">Drawn DA %</label>
                                <div className="flex gap-1 items-center">
                                  <input
                                    type="number"
                                    step="1"
                                    value={(row.drawnDaPercent ?? drawnDaPercent) === 0 ? "" : (row.drawnDaPercent ?? drawnDaPercent)}
                                    onChange={e => updateRowPercentages(row.id, 'drawnDaPercent', Math.max(0, Number(e.target.value)))}
                                    className="w-full px-2 py-0.5 text-xs font-mono border border-slate-300 rounded bg-white text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                  />
                                  <span className="font-semibold text-slate-400">%</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-slate-500 mb-0.5 font-medium">Drawn HRA %</label>
                                <div className="flex gap-1 items-center">
                                  <select
                                    value={row.drawnHraPercent ?? drawnHraPercent}
                                    onChange={e => updateRowPercentages(row.id, 'drawnHraPercent', Number(e.target.value))}
                                    className="w-full px-1 py-0.5 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                  >
                                    <option value="4">4%</option>
                                    <option value="5">5%</option>
                                    <option value="7.5">7.5%</option>
                                    <option value="10">10%</option>
                                    <option value="20">20%</option>
                                    {![4, 5, 7.5, 10, 20].includes(row.drawnHraPercent ?? drawnHraPercent) && (
                                      <option value={row.drawnHraPercent ?? drawnHraPercent}>{(row.drawnHraPercent ?? drawnHraPercent)}%</option>
                                    )}
                                  </select>
                                  <span className="font-semibold text-slate-400">%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>


                        {/* DUE & DRAWN Flex Layout */}
                        <div className="flex flex-col sm:flex-row gap-4">

                          {/* DUE Details */}
                          <div className="flex-1 min-w-0 p-3 bg-white border border-slate-200 rounded space-y-2.5 shadow-sm">
                            <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1 flex justify-between">
                              <span>DUE (देय वेतन)</span>
                              <span className="text-indigo-600 text-xs font-semibold">Net: ₹{row.due.net.toLocaleString()}</span>
                            </p>
                            
                            <div>
                              <div className="flex justify-between items-center mb-0.5">
                                <label className="block text-[10px] font-medium text-slate-500">
                                  Basic Pay (मूल वेतन) {useFitmentMatrix && <span className="text-emerald-600 text-[9px] font-semibold">(ऑटो मैट्रिक्स)</span>}
                                </label>
                                {useFitmentMatrix && row.overrides?.due?.basic !== undefined && (
                                  <button 
                                    onClick={() => clearOverride(row.id, 'due', 'basic')} 
                                    className="text-[9px] font-bold text-amber-600 hover:underline cursor-pointer"
                                  >
                                    Reset to Matrix
                                  </button>
                                )}
                              </div>
                              <input
                                type="number"
                                value={row.due.basic === 0 ? "" : row.due.basic}
                                onChange={e => updateRowField(row.id, 'due', 'basic', Number(e.target.value))}
                                className={`w-full px-2 py-1 text-xs font-semibold border rounded text-right focus:outline-none ${
                                  useFitmentMatrix && row.overrides?.due?.basic !== undefined
                                    ? 'border-amber-300 bg-amber-50/30 font-bold text-amber-900 focus:ring-1 focus:ring-amber-500'
                                    : useFitmentMatrix
                                      ? 'bg-emerald-50/20 text-emerald-950 border-emerald-200 focus:ring-1 focus:ring-emerald-500'
                                      : 'bg-white border-slate-300 focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <label className="text-slate-400 block font-medium">D.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.due.da === 0 ? "" : row.due.da}
                                    onChange={e => updateRowField(row.id, 'due', 'da', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.due?.da !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.due?.da !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'due', 'da')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">H.R.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.due.hra === 0 ? "" : row.due.hra}
                                    onChange={e => updateRowField(row.id, 'due', 'hra', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.due?.hra !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.due?.hra !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'due', 'hra')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">M.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.due.ma === 0 ? "" : row.due.ma}
                                    onChange={e => updateRowField(row.id, 'due', 'ma', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.due?.ma !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.due?.ma !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'due', 'ma')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">NPS (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.due.nps === 0 ? "" : row.due.nps}
                                    onChange={e => updateRowField(row.id, 'due', 'nps', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.due?.nps !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.due?.nps !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'due', 'nps')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">GIS (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.due.gis === 0 ? "" : row.due.gis}
                                    onChange={e => updateRowField(row.id, 'due', 'gis', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.due?.gis !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.due?.gis !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'due', 'gis')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* DRAWN Details */}
                          <div className="flex-1 min-w-0 p-3 bg-white border border-slate-200 rounded space-y-2.5 shadow-sm">
                            <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1 flex justify-between">
                              <span>DRAWN (प्राप्त वेतन)</span>
                              <span className="text-indigo-600 text-xs font-semibold">Net: ₹{row.drawn.net.toLocaleString()}</span>
                            </p>

                            <div>
                              <div className="flex justify-between items-center mb-0.5">
                                <label className="block text-[10px] font-medium text-slate-500">
                                  Basic Pay (मूल वेतन) {useFitmentMatrix && <span className="text-emerald-600 text-[9px] font-semibold">(ऑटो मैट्रिक्स)</span>}
                                </label>
                                {useFitmentMatrix && row.overrides?.drawn?.basic !== undefined && (
                                  <button 
                                    onClick={() => clearOverride(row.id, 'drawn', 'basic')} 
                                    className="text-[9px] font-bold text-amber-600 hover:underline cursor-pointer"
                                  >
                                    Reset to Matrix
                                  </button>
                                )}
                              </div>
                              <input
                                type="number"
                                value={row.drawn.basic === 0 ? "" : row.drawn.basic}
                                onChange={e => updateRowField(row.id, 'drawn', 'basic', Number(e.target.value))}
                                className={`w-full px-2 py-1 text-xs font-semibold border rounded text-right focus:outline-none ${
                                  useFitmentMatrix && row.overrides?.drawn?.basic !== undefined
                                    ? 'border-amber-300 bg-amber-50/30 font-bold text-amber-900 focus:ring-1 focus:ring-amber-500'
                                    : useFitmentMatrix
                                      ? 'bg-emerald-50/20 text-emerald-950 border-emerald-200 focus:ring-1 focus:ring-emerald-500'
                                      : 'bg-white border-slate-300 focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <label className="text-slate-400 block font-medium">D.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.drawn.da === 0 ? "" : row.drawn.da}
                                    onChange={e => updateRowField(row.id, 'drawn', 'da', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.drawn?.da !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.drawn?.da !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'drawn', 'da')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">H.R.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.drawn.hra === 0 ? "" : row.drawn.hra}
                                    onChange={e => updateRowField(row.id, 'drawn', 'hra', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.drawn?.hra !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.drawn?.hra !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'drawn', 'hra')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">M.A. (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.drawn.ma === 0 ? "" : row.drawn.ma}
                                    onChange={e => updateRowField(row.id, 'drawn', 'ma', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.drawn?.ma !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.drawn?.ma !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'drawn', 'ma')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">NPS (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.drawn.nps === 0 ? "" : row.drawn.nps}
                                    onChange={e => updateRowField(row.id, 'drawn', 'nps', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.drawn?.nps !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.drawn?.nps !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'drawn', 'nps')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-slate-400 block font-medium">GIS (₹)</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={row.drawn.gis === 0 ? "" : row.drawn.gis}
                                    onChange={e => updateRowField(row.id, 'drawn', 'gis', Number(e.target.value))}
                                    className={`w-full px-1.5 py-0.5 rounded text-right border ${row.overrides?.drawn?.gis !== undefined ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-slate-50 text-slate-500 focus:outline-none'}`}
                                  />
                                  {row.overrides?.drawn?.gis !== undefined && (
                                    <button onClick={() => clearOverride(row.id, 'drawn', 'gis')} className="absolute left-1 top-0.5 text-[8px] font-bold text-amber-600 hover:underline cursor-pointer">Reset</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                        </div> {/* Close of DUE & DRAWN Flex Layout */}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        {/* Right Side: High Fidelity Landscape Print Preview Sheet */}
        <section id="preview-pane" className="w-full lg:w-[58%] flex flex-col gap-4">
          
          {/* Preview Header & PDF Actions (Hidden during Print) */}
          <div className="no-print bg-white text-slate-800 rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">आधिकारिक प्रिंट प्रीव्यू (Live Print Format)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  Print / Save PDF (Ctrl+P)
                </button>
                
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-800/50 rounded transition-colors shadow-sm cursor-pointer"
                >
                  {isGeneratingPDF ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-3.5 h-3.5" />
                      Direct PDF Download
                    </>
                  )}
                </button>

                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded transition-colors shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel Export (एक्सेल डाउनलोड)
                </button>
              </div>
            </div>

            {/* Pagination settings */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2 rounded border border-slate-200/60 text-xs">
              <span className="font-bold text-slate-700">PDF पेज सेटिंग (PDF Page Fit):</span>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setPdfPageSplitMode('six-months')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    pdfPageSplitMode === 'six-months'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200 bg-white border border-slate-200'
                  }`}
                >
                  6-महीने का ब्लॉक (Standard)
                </button>
                <button
                  onClick={() => setPdfPageSplitMode('yearly')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    pdfPageSplitMode === 'yearly'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200 bg-white border border-slate-200'
                  }`}
                  title="12 months per page, perfect to fit 1-2 pages"
                >
                  12-महीने का ब्लॉक (Yearly)
                </button>
                <button
                  onClick={() => setPdfPageSplitMode('single-page')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    pdfPageSplitMode === 'single-page'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200 bg-white border border-slate-200'
                  }`}
                  title="Fit everything in a single landscape page"
                >
                  एक ही पेज में (1 Page Fit)
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Document Stage */}
          <div className="bg-slate-100 p-6 rounded-lg border border-slate-200 overflow-x-auto shadow-inner">
            
            {/* Real Official Format Container */}
            <div 
              id="arrear-sheet-preview" 
              className="flex flex-col gap-8 bg-transparent"
            >
              {(() => {
                const pageGroups = getPageGroups();
                
                // Pre-calculate cumulative page balances immutably
                const pageBalances = pageGroups.map((group, idx) => {
                  const opening = pageGroups
                    .slice(0, idx)
                    .reduce((sum, g) => sum + getPageTotal(g.rows, 'diff', 'net'), 0);
                  const pageNetDiff = getPageTotal(group.rows, 'diff', 'net');
                  const closing = opening + pageNetDiff;
                  return { opening, closing };
                });

                return pageGroups.map((group, pageIdx) => {
                  const isLastPage = pageIdx === pageGroups.length - 1;
                  const pageNetDiff = getPageTotal(group.rows, 'diff', 'net');
                  const pageOpeningBalance = pageBalances[pageIdx]?.opening ?? 0;
                  const pageClosingBalance = pageBalances[pageIdx]?.closing ?? 0;

                  // Dynamic layout spacing to prevent overflow and force fitting on 1-2 pages
                  const rowCount = group.rows.length;
                  let pagePadding = "p-8";
                  let headerMargin = "mb-5 border-b-2 border-black pb-3";
                  let metaMargin = "mb-4 grid grid-cols-12 gap-y-2 border border-black p-3 rounded-sm font-sans bg-slate-50/30 text-print-black text-[9px]";
                  let tableContainerClass = "w-full overflow-hidden border border-black text-[9px]";
                  let tableRowClass = "font-mono text-[8px] hover:bg-slate-50";
                  let tableCellPadding = "py-1";
                  let tableHeaderCellPadding = "px-0.5 py-0.5";
                  let tableFirstHeaderPadding = "px-1 py-1";
                  let pageTotalCellPadding = "py-1.5";
                  let openingBalancePadding = "py-1";
                  let closingBalancePadding = "py-1.5";
                  let wordSummaryClass = "mt-4 flex border border-black p-2 font-sans font-bold bg-slate-50/50 text-[10px] items-center text-print-black";
                  let signatureMargin = "mt-12";
                  let tableHeaderFontSize = "text-[7.5px]";

                  if (rowCount > 12) {
                    pagePadding = "p-3";
                    headerMargin = "mb-2 border-b border-black pb-1";
                    metaMargin = "mb-2 grid grid-cols-12 gap-y-1 border border-black p-1.5 rounded-sm font-sans bg-slate-50/30 text-print-black text-[7.5px]";
                    tableContainerClass = "w-full overflow-hidden border border-black text-[7.5px]";
                    tableRowClass = "font-mono text-[6.8px] hover:bg-slate-50";
                    tableCellPadding = "py-0.5";
                    tableHeaderCellPadding = "px-0.5 py-0.5";
                    tableFirstHeaderPadding = "px-0.5 py-0.5";
                    pageTotalCellPadding = "py-0.5 text-[6.8px]";
                    openingBalancePadding = "py-0.5 text-[6.8px]";
                    closingBalancePadding = "py-0.5 text-[6.8px]";
                    wordSummaryClass = "mt-2.5 flex border border-black p-1.5 font-sans font-bold bg-slate-50/50 text-[8.5px] items-center text-print-black";
                    signatureMargin = "mt-5";
                    tableHeaderFontSize = "text-[6.2px]";
                  } else if (rowCount > 6) {
                    pagePadding = "p-5";
                    headerMargin = "mb-3 border-b-2 border-black pb-2";
                    metaMargin = "mb-3 grid grid-cols-12 gap-y-1.5 border border-black p-2 rounded-sm font-sans bg-slate-50/30 text-print-black text-[8px]";
                    tableContainerClass = "w-full overflow-hidden border border-black text-[8px]";
                    tableRowClass = "font-mono text-[7.5px] hover:bg-slate-50";
                    tableCellPadding = "py-0.5";
                    tableHeaderCellPadding = "px-0.5 py-0.5";
                    tableFirstHeaderPadding = "px-1 py-0.5";
                    pageTotalCellPadding = "py-1 text-[7.5px]";
                    openingBalancePadding = "py-0.5 text-[7.5px]";
                    closingBalancePadding = "py-1 text-[7.5px]";
                    wordSummaryClass = "mt-3 flex border border-black p-2 font-sans font-bold bg-slate-50/50 text-[9px] items-center text-print-black";
                    signatureMargin = "mt-8";
                    tableHeaderFontSize = "text-[6.8px]";
                  }
                  
                  return (
                    <div 
                      key={group.key}
                      id={`arrear-sheet-preview-page-${pageIdx}`}
                      className={`print-page bg-white text-black ${pagePadding} shadow-md rounded-lg min-w-[1000px] mx-auto select-text font-serif leading-tight text-[11px] relative`}
                      style={{ contentVisibility: 'auto' }}
                    >
                      {/* Header Box */}
                      <div className={`text-center ${headerMargin} relative`}>
                        {/* Page counter display */}
                        <div className="flex justify-between items-center text-[8px] font-mono text-slate-400 font-bold uppercase tracking-wider mb-1 no-print">
                          <span>Page {pageIdx + 1} of {pageGroups.length}</span>
                          <span>{group.label}</span>
                        </div>
                        <h2 className="text-sm sm:text-base font-extrabold tracking-wide uppercase font-serif text-print-black">
                          OFFICE, DPO ESTABLISHMENT MUZAFFARPUR
                        </h2>
                        <h3 className="text-xs sm:text-sm font-extrabold tracking-widest uppercase mt-0.5 underline font-serif text-print-black">
                          SALARY ARREAR FORMAT ({group.label})
                        </h3>
                      </div>

                      {/* Personal details structured in standard 3-column metadata table */}
                      <div className={metaMargin}>
                        
                        {/* Row 1 */}
                        <div className="col-span-6 flex gap-1">
                          <span className="font-bold uppercase w-32 tracking-tight">NAME OF SCHOOL:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.schoolName || '—'}</span>
                        </div>
                        <div className="col-span-3 flex gap-1 px-2">
                          <span className="font-bold uppercase w-20 tracking-tight">BLOCK NAME:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.blockName || '—'}</span>
                        </div>
                        <div className="col-span-3 flex gap-1">
                          <span className="font-bold uppercase w-24 tracking-tight">DATE OF JOINING:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.dateOfJoining || '—'}</span>
                        </div>

                        {/* Row 2 */}
                        <div className="col-span-6 flex gap-1">
                          <span className="font-bold uppercase w-32 tracking-tight">NAME OF TEACHER:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-bold text-slate-800 pb-0.5 truncate">{teacherInfo.teacherName || '—'}</span>
                        </div>
                        <div className="col-span-3 flex gap-1 px-2">
                          <span className="font-bold uppercase w-20 tracking-tight">DESIGNATION:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.designation || '—'}</span>
                        </div>
                        <div className="col-span-3 flex gap-1">
                          <span className="font-bold uppercase w-24 tracking-tight">IFSC:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.ifsc || '—'}</span>
                        </div>

                        {/* Row 3 */}
                        <div className="col-span-6 flex gap-1">
                          <span className="font-bold uppercase w-32 tracking-tight">PRAN NO.:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.pran || '—'}</span>
                        </div>
                        <div className="col-span-6 flex gap-1">
                          <span className="font-bold uppercase w-28 tracking-tight">ACCOUNT NO.:</span>
                          <span className="border-b border-black/30 flex-1 font-mono font-medium pb-0.5 truncate">{teacherInfo.accountNo || '—'}</span>
                        </div>
                      </div>

                      {/* Massive 26-column official table */}
                      <div className={tableContainerClass}>
                        <table className="w-full text-center border-collapse border-black">
                          <thead>
                            
                            {/* Header Row 1 */}
                            <tr className="bg-slate-100/50">
                              <th className={`border border-black font-bold text-center ${tableFirstHeaderPadding} w-[65px]`} rowSpan={2}>MONTH</th>
                              <th className={`border border-black font-bold text-center ${tableFirstHeaderPadding} w-[40px]`} rowSpan={2}>No of Days</th>
                              
                              {/* DUE Headers */}
                              <th className="border border-black font-extrabold uppercase py-1 text-center bg-emerald-500/10" colSpan={8}>DUE</th>
                              
                              {/* DRAWN Headers */}
                              <th className="border border-black font-extrabold uppercase py-1 text-center bg-indigo-500/10" colSpan={8}>DRAWN</th>
                              
                              {/* DIFFERENCE Headers */}
                              <th className="border border-black font-extrabold uppercase py-1 text-center bg-amber-500/10" colSpan={8}>DIFFERENCE</th>
                            </tr>

                            {/* Header Row 2 */}
                            <tr className={`bg-slate-50/50 ${tableHeaderFontSize} font-bold`}>
                              {/* DUE sub-columns */}
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">Basic Pay</th>
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">D.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">H.R.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">M.A.</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-emerald-500/5">GROSS PAY</th>
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">NPS</th>
                              <th className="border border-black px-0.5 py-0.5 bg-emerald-500/5">GIS</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-emerald-500/5">NET PAY</th>

                              {/* DRAWN sub-columns */}
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">Basic Pay</th>
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">D.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">H.R.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">M.A.</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-indigo-500/5">GROSS PAY</th>
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">NPS</th>
                              <th className="border border-black px-0.5 py-0.5 bg-indigo-500/5">GIS</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-indigo-500/5">NET PAY</th>

                              {/* DIFFERENCE sub-columns */}
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">Basic Pay</th>
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">D.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">H.R.A.</th>
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">M.A.</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-amber-500/5">GROSS PAY</th>
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">NPS</th>
                              <th className="border border-black px-0.5 py-0.5 bg-amber-500/5">GIS</th>
                              <th className="border border-black px-0.5 py-0.5 font-bold bg-amber-500/5">NET PAY</th>
                            </tr>

                          </thead>
                          <tbody>
                            {/* Dynamic Month Rows */}
                            {group.rows.map(row => (
                              <tr key={row.id} className={`hover:bg-slate-50 ${tableRowClass}`}>
                                {/* Month Info */}
                                <td className={`border border-black font-sans font-semibold text-center ${tableCellPadding}`}>{row.month}</td>
                                <td className={`border border-black text-center ${tableCellPadding}`}>{row.days}</td>

                                {/* DUE values */}
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.basic || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.da || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.hra || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.ma || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 font-bold ${tableCellPadding} bg-emerald-500/5`}>{row.due.gross || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.nps || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.due.gis || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 font-extrabold ${tableCellPadding} bg-emerald-500/10`}>{row.due.net || '—'}</td>

                                {/* DRAWN values */}
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.basic || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.da || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.hra || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.ma || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 font-bold ${tableCellPadding} bg-indigo-500/5`}>{row.drawn.gross || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.nps || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.drawn.gis || '—'}</td>
                                <td className={`border border-black text-right pr-0.5 font-extrabold ${tableCellPadding} bg-indigo-500/10`}>{row.drawn.net || '—'}</td>

                                {/* DIFFERENCE values */}
                                <td className={`border border-black text-right pr-0.5 font-bold text-slate-800 ${tableCellPadding}`}>{row.diff.basic || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.diff.da || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.diff.hra || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.diff.ma || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 font-bold ${tableCellPadding} bg-amber-500/5`}>{row.diff.gross || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.diff.nps || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 ${tableCellPadding}`}>{row.diff.gis || '0'}</td>
                                <td className={`border border-black text-right pr-0.5 font-extrabold ${tableCellPadding} bg-amber-500/10 text-print-black`}>{row.diff.net || '0'}</td>
                              </tr>
                            ))}

                            {/* PAGE TOTAL ROW */}
                            <tr className={`font-mono font-bold bg-slate-100 ${tableRowClass}`}>
                              <td className={`border-2 border-black font-sans font-bold text-center ${pageTotalCellPadding}`} colSpan={2}>PAGE TOTAL</td>
                              
                              {/* DUE Totals */}
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'basic').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'da').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'hra').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'ma').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-emerald-500/10`}>{getPageTotal(group.rows, 'due', 'gross').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'nps').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'due', 'gis').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-emerald-500/20`}>{getPageTotal(group.rows, 'due', 'net').toLocaleString()}</td>

                              {/* DRAWN Totals */}
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'basic').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'da').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'hra').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'ma').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-indigo-500/10`}>{getPageTotal(group.rows, 'drawn', 'gross').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'nps').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'drawn', 'gis').toLocaleString()}</td>
                              <td className={`border border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-indigo-500/20`}>{getPageTotal(group.rows, 'drawn', 'net').toLocaleString()}</td>

                              {/* DIFFERENCE Totals */}
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'basic').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'da').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'hra').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'ma').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-amber-500/10`}>{getPageTotal(group.rows, 'diff', 'gross').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'nps').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 ${pageTotalCellPadding}`}>{getPageTotal(group.rows, 'diff', 'gis').toLocaleString()}</td>
                              <td className={`border-2 border-black text-right pr-0.5 font-extrabold ${pageTotalCellPadding} bg-amber-500/20 text-print-black`}>{pageNetDiff.toLocaleString()}</td>
                            </tr>

                            {/* OPENING DIFFERENCE BALANCE ROW */}
                            <tr className={`font-mono font-bold bg-amber-50/20 ${tableRowClass}`}>
                              <td className={`border border-black text-left pl-2 font-sans text-amber-900 ${tableCellPadding}`} colSpan={18}>
                                OPENING BALANCE OF DIFFERENCE (प्रारंभिक अंतर राशि शेष)
                              </td>
                              <td className={`border border-black text-right pr-1 font-extrabold bg-amber-500/5 text-print-black ${tableCellPadding}`} colSpan={8}>
                                ₹{pageOpeningBalance.toLocaleString()}
                              </td>
                            </tr>

                            {/* CLOSING DIFFERENCE BALANCE ROW */}
                            <tr className={`font-mono font-extrabold bg-amber-500/10 ${tableRowClass}`}>
                              <td className={`border-2 border-black text-left pl-2 font-sans text-amber-950 ${pageTotalCellPadding}`} colSpan={18}>
                                CLOSING BALANCE OF DIFFERENCE (अंतिम अंतर राशि शेष)
                              </td>
                              <td className={`border-2 border-black text-right pr-1 font-extrabold bg-amber-500/25 text-amber-950 ${pageTotalCellPadding}`} colSpan={8}>
                                ₹{pageClosingBalance.toLocaleString()}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Summary Blocks at Page Bottom */}
                      {isLastPage && (
                        <div className={wordSummaryClass}>
                          <span className="uppercase tracking-wider mr-2 font-extrabold select-none">
                            {pageGroups.length > 1 ? "GRAND TOTAL IN WORDS (कुल महायोग शब्दों में):" : "IN WORDS:"}
                          </span>
                          <span className="font-mono text-slate-800 bg-white border border-slate-200/50 px-2 py-0.5 rounded-sm flex-1">
                            {convertNumberToWords(grandTotalDiffNet)}
                          </span>
                        </div>
                      )}

                      {/* Official Signature Lines */}
                      <div className={`flex justify-between px-10 text-[9px] text-print-black ${signatureMargin}`}>
                        <div className="text-center">
                          <p className="border-t border-black/30 pt-1 px-4 font-bold uppercase tracking-tight select-none">Signature of Teacher</p>
                          <p className="text-[7.5px] text-slate-400 mt-0.5">शिक्षक के हस्ताक्षर</p>
                        </div>
                        <div className="text-center">
                          <p className="border-t border-black/30 pt-1 px-4 font-bold uppercase tracking-tight select-none">Signature of HM</p>
                          <p className="text-[7.5px] text-slate-400 mt-0.5">प्रधान शिक्षक के हस्ताक्षर</p>
                        </div>
                        <div className="text-center">
                          <p className="border-t border-black/30 pt-1 px-4 font-bold uppercase tracking-tight select-none">DPO Establishment Office</p>
                          <p className="text-[7.5px] text-slate-400 mt-0.5">डी० पी० ओ० स्थापना कार्यालय</p>
                        </div>
                      </div>

                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Bilingual Guide info at bottom of preview */}
          <div className="no-print bg-slate-100 rounded-xl p-4 border border-slate-200/60 text-xs text-slate-600 space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1">
              <Printer className="w-4 h-4 text-slate-500" />
              पीडीएफ और प्रिंट के लिए मार्गदर्शिका (Bilingual Guide)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 leading-relaxed text-[11px]">
              <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200/40">
                <p className="font-bold text-indigo-700">🖥️ प्रिंट / सेव पीडीएफ विधि (सर्वोत्तम क्वालिटी)</p>
                <ol className="list-decimal pl-4 text-slate-500 space-y-0.5">
                  <li><b>Print / Save PDF</b> बटन पर क्लिक करें।</li>
                  <li>दिखने वाले प्रिंट डायलॉग में Destination को <b>Save as PDF</b> चुनें।</li>
                  <li>Layout को <b>Landscape</b> (समतल) चुनें।</li>
                  <li>Paper size को <b>A4</b> सेट करें।</li>
                  <li><b>Save</b> बटन दबाकर अपने कंप्यूटर में सुरक्षित करें।</li>
                </ol>
              </div>

              <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200/40">
                <p className="font-bold text-emerald-700">⚡ डायरेक्ट पीडीएफ डाउनलोड (त्वरित विधि)</p>
                <ol className="list-decimal pl-4 text-slate-500 space-y-0.5">
                  <li><b>Direct PDF Download</b> बटन दबाएं।</li>
                  <li>यह सीधे एक-क्लिक में ब्राउज़र में सेव कर देगा।</li>
                  <li><i>नोट:</i> क्रिस्टल-क्लियर अक्षरों और पेपर प्रिंटिंग के लिए <b>पहला विकल्प</b> (Print/Save PDF) सबसे उत्तम परिणाम देता है।</li>
                </ol>
              </div>
            </div>
          </div>

        </section>

      </main>

      {/* Dynamic styling triggers to hide standard page padding during browser print */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm 12mm;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          #editor-pane, header, .no-print {
            display: none !important;
          }
          #preview-pane {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-page {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            min-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* ======================================================== */}
      {/* CUSTOM MODALS FOR PREVENTING IFRAME WINDOW.CONFIRM BLOCKS */}
      {/* ======================================================== */}

      {/* 1. RESET ALL DATA MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn no-print">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-100 overflow-hidden animate-scaleIn">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">क्या आप डेटा रीसेट करना चाहते हैं?</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                यह क्रिया आपके द्वारा दर्ज किए गए सभी कर्मचारियों की व्यक्तिगत जानकारी और सभी महीनों के मूल वेतन के इतिहास को पूरी तरह से हटा देगी और शुरुआत से नया एरियर शीट सेट करेगी।
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={confirmResetAll}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded transition cursor-pointer"
              >
                हाँ, रीसेट करें (Yes, Reset)
              </button>
            </div>
          </div>
        </div>
      )}



      {/* 3. DELETE ERROR WARNING MODAL */}
      {showDeleteErrorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn no-print">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-100 overflow-hidden animate-scaleIn">
            <div className="p-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                <Info className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">डिलीट करना संभव नहीं है</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                कम से कम एक महीना तालिका में होना अनिवार्य है। आप अंतिम बचे हुए महीने को डिलीट नहीं कर सकते। यदि आप सारा डेटा साफ़ करना चाहते हैं, तो &apos;रीसेट करें&apos; बटन का उपयोग करें।
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteErrorModal(false)}
                className="px-5 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
              >
                ठीक है (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. PDF ERROR MESSAGE MODAL */}
      {pdfErrorMessage && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn no-print">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-100 overflow-hidden animate-scaleIn">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <Info className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">PDF डाउनलोड करने में समस्या</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {pdfErrorMessage}
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPdfErrorMessage(null)}
                className="px-5 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
              >
                ठीक है (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BULK GENERATE CONFIRMATION MODAL */}
      {showBulkGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn no-print">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-100 overflow-hidden animate-scaleIn">
            <div className="p-6">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">थोक में महीना रेंज जनरेट करें?</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                क्या आप वर्तमान में दर्ज सभी महीनों की पंक्तियों को हटाकर नई समय सीमा के अनुसार एरियर शीट जनरेट करना चाहते हैं?
              </p>
              <div className="mt-3 bg-indigo-50/50 rounded p-2.5 border border-indigo-100/50 text-[10px] text-slate-600 space-y-1">
                <p>📅 <b>चयनित रेंज:</b> {MONTH_NAMES[startMonth]} {startYear} से {MONTH_NAMES[endMonth]} {endYear} तक</p>
                <p>💰 <b>शुरुआती मूल वेतन (Start Basic):</b> ₹{startDueBasic}</p>
              </div>
              <p className="text-[10px] text-amber-600 mt-2 font-medium">
                ⚠️ ध्यान दें: इससे वर्तमान में दर्ज की गयी सभी महीनों की प्रविष्टियां हटा दी जायेंगी!
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkGenerateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={confirmBulkGenerate}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition cursor-pointer"
              >
                हाँ, जनरेट करें (Yes, Generate)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
