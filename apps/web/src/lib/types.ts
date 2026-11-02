/** Shapes returned by the API. Money is always an exact decimal string ("78050.00"). */
export type Money = string;
export type Role = 'SUPER_ADMIN' | 'ACCOUNTANT' | 'AUDITOR';
export type Source = 'INTERNAL' | 'GRANT';
export type Nature = 'CAPITAL' | 'RECURRENT';
export type VoucherStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CANCELLED';

export interface User { id: string; username: string; fullName: string; post: string; role: Role; language: 'ne' | 'en'; orgId: string }
export interface Fund { id: string; source: Source; nature: Nature; nameNe: string; nameEn: string }
export interface FiscalYear { id: string; code: string; startBs: string; endBs: string; closed: boolean; startYear: number }
export interface TaxRule { id: string; code: string; nameNe: string; nameEn: string; rateBp: number; excludeVat: boolean; effectiveFromBs: string }
export interface Org {
  id: string; nameNe: string; nameEn: string; govLevelNe: string; govLevelEn: string; ministryNe: string; ministryEn: string; officeCode: string;
  addressNe: string; addressEn: string; districtNe: string; districtEn: string; pan: string; tdsRounding: string; vatRateBp: number; sessionIdleMinutes: number;
  accountsHeadName: string; accountsHeadPost: string; officeHeadName: string; officeHeadPost: string;
}
export interface Meta { org: Org; funds: Fund[]; fiscalYears: FiscalYear[]; currentFiscalYearId: string | null; todayBs: string; subHeads: { id: string; code: string; nameNe: string; nameEn: string }[]; taxRules: TaxRule[] }
export interface Account { id: string; kind: string; code: string; activityNo: string; nameNe: string; nameEn: string; nature: Nature | null; folioNo: string; bankName: string; bankBranch: string; accountNo: string; active: boolean }
export interface Payee { id: string; name: string; pan: string; vatRegistered: boolean; payeeType: string; defaultTaxCode: string | null; bankName: string; bankBranch: string; accountNo: string; phone: string; address: string; active: boolean }
export interface BudgetHead { id: string; code: string; activityNo: string; nameNe: string; nameEn: string; folioNo: string; allocated: Money; spent: Money; pending: Money; remaining: Money }
