export interface UserBillingSnapshot {
  orderLimitCents: number | null | undefined;
}

export interface OrderBillingSummary {
  companyPaidCents: number;
  employeeDebtCents: number;
}

export const calculateOrderBilling = (
  totalCents: number,
  user: UserBillingSnapshot
): OrderBillingSummary => {
  const normalizedTotal = Math.max(Number(totalCents) || 0, 0);
  const normalizedLimit = Math.max(Number(user.orderLimitCents ?? 0) || 0, 0);
  const companyPaidCents = Math.min(normalizedTotal, normalizedLimit);
  const employeeDebtCents = Math.max(normalizedTotal - normalizedLimit, 0);

  return {
    companyPaidCents,
    employeeDebtCents,
  };
};
