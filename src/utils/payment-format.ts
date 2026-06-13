type Params = {
  totalAmount: number;
  payments: Array<{
    paymentMethodId: string;
    amount: number;
    isChange: boolean;
  }>;
};
export function formatPaymentMethod(params: Params) {
  let paymentStatus: "paid" | "partially_paid" | "due" = "due";
  let totalAmountDue = 0;
  const { totalAmount, payments } = params;
  const inboundPaymentTotals = new Map<string, number>();
  payments.forEach((payment) => {
    if (payment.isChange) {
      return;
    }

    const currentAmount =
      inboundPaymentTotals.get(payment.paymentMethodId) || 0;
    inboundPaymentTotals.set(
      payment.paymentMethodId,
      currentAmount + payment.amount,
    );
  });

  const inboundPayments = Array.from(inboundPaymentTotals.entries()).map(
    ([paymentMethodId, amount]) => ({
      paymentMethodId,
      amount,
      isChange: false,
    }),
  );
  const totalAmountPaid = inboundPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0,
  );
  const outboundPayment = payments.find((payment) => payment.isChange);
  if (totalAmount > totalAmountPaid) {
    totalAmountDue = totalAmount - totalAmountPaid;
  }
  if (totalAmountPaid >= totalAmount) {
    paymentStatus = "paid";
  } else if (totalAmountPaid < totalAmount && totalAmountPaid > 0) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "due";
  }
  return {
    totalAmountPaid,
    paymentStatus,
    inboundPayments,
    outboundPayment,
    totalAmountDue,
  };
}
