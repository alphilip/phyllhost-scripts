// Event handlers — one function per Paystack webhook event.
//
// Each handler logs what happened and performs the action that event
// calls for. Handlers run AFTER index.js has already answered
// Paystack with 200, so a slow delivery step never makes Paystack
// retry the webhook.
//
// ------------------------------------------------------------------
// PLACEHOLDER — replace deliverOrder() with your real delivery step:
// update the order in your database, email/send the product, call
// another API, credit the customer's account, etc. It is the ONLY
// function you must change to go live; everything else is plumbing.
// ------------------------------------------------------------------
// To test the retry queue without breaking real orders, send a
// charge.success whose data.metadata.simulate_delivery_failure is
// "true" — deliverOrder() will throw and the event lands in
// data/retry-queue.json. Remove that test hook when you wire in the
// real delivery step.
async function deliverOrder(event) {
  const data = event.data || {};
  if (data.metadata && String(data.metadata.simulate_delivery_failure) === 'true') {
    throw new Error('simulated delivery failure (metadata.simulate_delivery_failure=true)');
  }
  // Example real step:
  //   await db.orders.update({ reference: data.reference }, { status: 'paid' });
  //   await email.send(data.customer.email, 'Your order is confirmed');
  return {
    reference: data.reference,
    email: data.customer && data.customer.email,
    amount: data.amount,
    currency: data.currency,
  };
}

function summary(data) {
  return {
    reference: data.reference || data.subscription_code || data.invoice_code || null,
    amount: typeof data.amount === 'number' ? data.amount : null,
    currency: data.currency || null,
    email: (data.customer && data.customer.email) || null,
  };
}

async function handleChargeSuccess(event, logger) {
  const data = event.data || {};
  logger.info('payment succeeded, delivering order', summary(data));
  await deliverOrder(event);
  logger.info('order delivered', summary(data));
}

async function handleSubscriptionCreate(event, logger) {
  const data = event.data || {};
  logger.info('subscription created', {
    ...summary(data),
    subscriptionCode: data.subscription_code || null,
    plan: (data.plan && (data.plan.name || data.plan.plan_code)) || null,
    nextPaymentDate: data.next_payment_date || null,
  });
  // Real step: store the subscription_code against the customer so
  // later disable / not_renew events can find their account.
  //   await db.subscriptions.upsert({ code: data.subscription_code, email, plan, status: 'active' });
}

async function handleSubscriptionDisable(event, logger) {
  const data = event.data || {};
  logger.info('subscription disabled', {
    ...summary(data),
    subscriptionCode: data.subscription_code || null,
  });
  // Real step: mark the subscription cancelled in your database and
  // stop granting the paid benefit at the end of the paid period.
  //   await db.subscriptions.update({ code: data.subscription_code }, { status: 'disabled' });
}

async function handleSubscriptionNotRenew(event, logger) {
  const data = event.data || {};
  logger.info('subscription will not renew', {
    ...summary(data),
    subscriptionCode: data.subscription_code || null,
  });
  // Real step: flag the subscription as non-renewing and (optionally)
  // email the customer a win-back / update-card reminder before the
  // current period ends. Access itself ends at next_payment_date.
}

async function handleTransferSuccess(event, logger) {
  const data = event.data || {};
  logger.info('transfer succeeded', {
    ...summary(data),
    transferCode: data.transfer_code || null,
    recipient: (data.recipient && (data.recipient.name || data.recipient.recipient_code)) || null,
    reason: data.reason || null,
  });
  // Real step: mark the payout complete in your ledger.
}

async function handleTransferFailed(event, logger) {
  const data = event.data || {};
  logger.warn('transfer failed', {
    ...summary(data),
    transferCode: data.transfer_code || null,
    recipient: (data.recipient && (data.recipient.name || data.recipient.recipient_code)) || null,
    reason: data.reason || null,
  });
  // Real step: alert the admin / re-queue the payout, and record the
  // failure against the withdrawal so it is not silently lost.
}

async function handleInvoiceCreate(event, logger) {
  const data = event.data || {};
  logger.info('invoice created', {
    ...summary(data),
    invoiceCode: data.invoice_code || null,
    status: data.status || null,
    dueDate: data.due_date || null,
  });
  // Real step: record the invoice so you can match the later
  // invoice.update / charge.success against it.
}

async function handleInvoiceUpdate(event, logger) {
  const data = event.data || {};
  logger.info('invoice updated', {
    ...summary(data),
    invoiceCode: data.invoice_code || null,
    status: data.status || null,
    paid: data.paid || false,
  });
  // Real step: if data.paid is true, treat the invoice as settled
  // (the matching charge.success is the authoritative payment event).
}

const handlers = {
  'charge.success': handleChargeSuccess,
  'subscription.create': handleSubscriptionCreate,
  'subscription.disable': handleSubscriptionDisable,
  'subscription.not_renew': handleSubscriptionNotRenew,
  'transfer.success': handleTransferSuccess,
  'transfer.failed': handleTransferFailed,
  'invoice.create': handleInvoiceCreate,
  'invoice.update': handleInvoiceUpdate,
};

/**
 * Dispatch an event to its handler. Returns 'handled', 'unknown'
 * (no handler for this event type — logged, not an error), or throws
 * so the caller can put the event on the retry queue.
 */
async function dispatch(event, logger) {
  const handler = handlers[event.event];
  if (!handler) {
    logger.warn('unhandled event type', { event: event.event, id: event.id || null });
    return 'unknown';
  }
  await handler(event, logger);
  return 'handled';
}

module.exports = {
  handlers,
  dispatch,
  deliverOrder,
  handleChargeSuccess,
  handleSubscriptionCreate,
  handleSubscriptionDisable,
  handleSubscriptionNotRenew,
  handleTransferSuccess,
  handleTransferFailed,
  handleInvoiceCreate,
  handleInvoiceUpdate,
};
