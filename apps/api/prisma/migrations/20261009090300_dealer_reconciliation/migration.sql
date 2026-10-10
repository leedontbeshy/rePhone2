CREATE TABLE dealer_reconciliation_cases (
  id UUID PRIMARY KEY,
  bank_transaction_id UUID NOT NULL REFERENCES dealer_bank_transactions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  proposed_amount DECIMAL(15,0) NOT NULL CHECK (proposed_amount <> 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 5),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  opened_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ(3), resolved_by_id UUID REFERENCES users(id), resolution_note TEXT,
  CHECK (num_nonnulls(resolved_at,resolved_by_id,resolution_note) IN (0,3))
);
CREATE INDEX dealer_reconciliation_cases_bank_transaction_id_resolved_at_idx ON dealer_reconciliation_cases(bank_transaction_id,resolved_at);
