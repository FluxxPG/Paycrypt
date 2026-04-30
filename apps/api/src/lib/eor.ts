import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { nanoid } from "nanoid";
import { quoteCryptoAmount } from "./pricing.js";
import { createBatchPayout, processBatchPayout } from "./batch-payout.js";

// Employer functions
export const createEmployer = async (input: {
  merchantId: string;
  companyName: string;
  companyLegalName: string;
  registrationNumber?: string;
  taxId?: string;
  country: string;
  stateProvince?: string;
  city: string;
  address: string;
  postalCode: string;
  contactEmail: string;
  contactPhone?: string;
}) => {
  const employerId = `emp_${nanoid(16)}`;
  
  const result = await query<{ id: string }>(
    `insert into employers (
      id, merchant_id, company_name, company_legal_name, registration_number, tax_id,
      country, state_province, city, address, postal_code, contact_email, contact_phone
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    returning id`,
    [
      employerId,
      input.merchantId,
      input.companyName,
      input.companyLegalName,
      input.registrationNumber ?? null,
      input.taxId ?? null,
      input.country,
      input.stateProvince ?? null,
      input.city,
      input.address,
      input.postalCode,
      input.contactEmail,
      input.contactPhone ?? null
    ]
  );
  
  return { employerId: result.rows[0].id };
};

export const getEmployerByMerchantId = async (merchantId: string) => {
  const result = await query<{
    id: string;
    company_name: string;
    company_legal_name: string;
    registration_number: string | null;
    tax_id: string | null;
    country: string;
    state_province: string | null;
    city: string;
    address: string;
    postal_code: string;
    contact_email: string;
    contact_phone: string | null;
    status: string;
    onboarding_completed_at: string | null;
  }>(
    `select * from employers where merchant_id = $1 limit 1`,
    [merchantId]
  );
  
  return result.rows[0] ?? null;
};

export const getEmployerOverview = async (merchantId: string) => {
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return {
      employer: null,
      stats: {
        totalEmployees: 0,
        activeEmployees: 0,
        pendingOnboarding: 0,
        totalPayrollRuns: 0,
        lastPayrollDate: null
      },
      recentActivity: []
    };
  }

  const [employeeStats, payrollStats, recentActivity] = await Promise.all([
    query<{
      total_employees: number;
      active_employees: number;
      pending_onboarding: number;
    }>(
      `select
          count(*)::int as total_employees,
          count(*) filter (where status = 'active')::int as active_employees,
          count(*) filter (where status in ('pending', 'onboarding'))::int as pending_onboarding
       from employees
       where employer_id = $1`,
      [employer.id]
    ),
    query<{
      total_payroll_runs: number;
      last_payroll_date: string | null;
    }>(
      `select
          count(*)::int as total_payroll_runs,
          max(coalesce(processed_at, approved_at, scheduled_pay_date::timestamptz)) as last_payroll_date
       from payroll_runs
       where employer_id = $1`,
      [employer.id]
    ),
    query<{
      kind: string;
      title: string;
      subtitle: string;
      occurred_at: string;
    }>(
      `select *
       from (
         select
           'payroll' as kind,
           concat('Payroll run #', run_number, ' ', status) as title,
           concat(total_employees, ' employees, ', coalesce(total_net_pay, 0), ' ', coalesce((select currency from payslips where payroll_run_id = payroll_runs.id limit 1), 'USD')) as subtitle,
           coalesce(processed_at, approved_at, created_at) as occurred_at
         from payroll_runs
         where employer_id = $1
         union all
         select
           'employee' as kind,
           concat(first_name, ' ', last_name, ' onboarded') as title,
           concat(email, ' - ', employment_type) as subtitle,
           created_at as occurred_at
         from employees
         where employer_id = $1
         union all
         select
           'contract' as kind,
           concat('Contract ', status) as title,
           concat(contract_type, ' - ', salary_amount, ' ', salary_currency, ' ', salary_frequency) as subtitle,
           created_at as occurred_at
         from employment_contracts
         where employer_id = $1
       ) activity
       order by occurred_at desc
       limit 8`,
      [employer.id]
    )
  ]);

  return {
    employer,
    stats: {
      totalEmployees: employeeStats.rows[0]?.total_employees ?? 0,
      activeEmployees: employeeStats.rows[0]?.active_employees ?? 0,
      pendingOnboarding: employeeStats.rows[0]?.pending_onboarding ?? 0,
      totalPayrollRuns: payrollStats.rows[0]?.total_payroll_runs ?? 0,
      lastPayrollDate: payrollStats.rows[0]?.last_payroll_date ?? null
    },
    recentActivity: recentActivity.rows
  };
};

export const updateEmployer = async (employerId: string, updates: {
  companyName?: string;
  companyLegalName?: string;
  registrationNumber?: string;
  taxId?: string;
  country?: string;
  stateProvince?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  status?: string;
}) => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  
  if (updates.companyName !== undefined) {
    fields.push(`company_name = $${paramIndex++}`);
    values.push(updates.companyName);
  }
  if (updates.companyLegalName !== undefined) {
    fields.push(`company_legal_name = $${paramIndex++}`);
    values.push(updates.companyLegalName);
  }
  if (updates.registrationNumber !== undefined) {
    fields.push(`registration_number = $${paramIndex++}`);
    values.push(updates.registrationNumber);
  }
  if (updates.taxId !== undefined) {
    fields.push(`tax_id = $${paramIndex++}`);
    values.push(updates.taxId);
  }
  if (updates.country !== undefined) {
    fields.push(`country = $${paramIndex++}`);
    values.push(updates.country);
  }
  if (updates.stateProvince !== undefined) {
    fields.push(`state_province = $${paramIndex++}`);
    values.push(updates.stateProvince);
  }
  if (updates.city !== undefined) {
    fields.push(`city = $${paramIndex++}`);
    values.push(updates.city);
  }
  if (updates.address !== undefined) {
    fields.push(`address = $${paramIndex++}`);
    values.push(updates.address);
  }
  if (updates.postalCode !== undefined) {
    fields.push(`postal_code = $${paramIndex++}`);
    values.push(updates.postalCode);
  }
  if (updates.contactEmail !== undefined) {
    fields.push(`contact_email = $${paramIndex++}`);
    values.push(updates.contactEmail);
  }
  if (updates.contactPhone !== undefined) {
    fields.push(`contact_phone = $${paramIndex++}`);
    values.push(updates.contactPhone);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
    if (updates.status === 'active') {
      fields.push(`onboarding_completed_at = now()`);
    }
  }
  
  fields.push(`updated_at = now()`);
  values.push(employerId);
  
  await query(
    `update employers set ${fields.join(', ')} where id = $${paramIndex}`,
    values
  );
  
  const result = await query(`select * from employers where id = $1 limit 1`, [employerId]);
  return result.rows[0] ?? null;
};

// Employee functions
export const createEmployee = async (employerId: string, input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  nationality: string;
  countryOfResidence: string;
  taxId?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankName?: string;
  bankAddress?: string;
  cryptoAddress?: string;
  cryptoNetwork?: string;
  employmentType: 'full_time' | 'part_time' | 'contractor';
}) => {
  const result = await query<{ id: string }>(
    `insert into employees (
      employer_id, first_name, last_name, email, phone, date_of_birth, nationality,
      country_of_residence, tax_id, bank_account_number, bank_routing_number,
      bank_name, bank_address, crypto_address, crypto_network, employment_type
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    returning id`,
    [
      employerId,
      input.firstName,
      input.lastName,
      input.email,
      input.phone ?? null,
      input.dateOfBirth ?? null,
      input.nationality,
      input.countryOfResidence,
      input.taxId ?? null,
      input.bankAccountNumber ?? null,
      input.bankRoutingNumber ?? null,
      input.bankName ?? null,
      input.bankAddress ?? null,
      input.cryptoAddress ?? null,
      input.cryptoNetwork ?? null,
      input.employmentType
    ]
  );
  
  return { employeeId: result.rows[0].id };
};

export const listEmployees = async (employerId: string, status?: string) => {
  let queryStr = `select * from employees where employer_id = $1`;
  const params: unknown[] = [employerId];
  
  if (status) {
    queryStr += ` and status = $2`;
    params.push(status);
  }
  
  queryStr += ` order by created_at desc`;
  
  return query(queryStr, params).then((res) => res.rows);
};

export const getEmployee = async (employeeId: string) => {
  const result = await query(
    `select * from employees where id = $1 limit 1`,
    [employeeId]
  );
  
  return result.rows[0] ?? null;
};

export const updateEmployee = async (employeeId: string, updates: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  countryOfResidence?: string;
  taxId?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankName?: string;
  bankAddress?: string;
  cryptoAddress?: string;
  cryptoNetwork?: string;
  status?: string;
  terminationDate?: string;
  terminationReason?: string;
}) => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  
  if (updates.firstName !== undefined) {
    fields.push(`first_name = $${paramIndex++}`);
    values.push(updates.firstName);
  }
  if (updates.lastName !== undefined) {
    fields.push(`last_name = $${paramIndex++}`);
    values.push(updates.lastName);
  }
  if (updates.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(updates.phone);
  }
  if (updates.dateOfBirth !== undefined) {
    fields.push(`date_of_birth = $${paramIndex++}`);
    values.push(updates.dateOfBirth);
  }
  if (updates.nationality !== undefined) {
    fields.push(`nationality = $${paramIndex++}`);
    values.push(updates.nationality);
  }
  if (updates.countryOfResidence !== undefined) {
    fields.push(`country_of_residence = $${paramIndex++}`);
    values.push(updates.countryOfResidence);
  }
  if (updates.taxId !== undefined) {
    fields.push(`tax_id = $${paramIndex++}`);
    values.push(updates.taxId);
  }
  if (updates.bankAccountNumber !== undefined) {
    fields.push(`bank_account_number = $${paramIndex++}`);
    values.push(updates.bankAccountNumber);
  }
  if (updates.bankRoutingNumber !== undefined) {
    fields.push(`bank_routing_number = $${paramIndex++}`);
    values.push(updates.bankRoutingNumber);
  }
  if (updates.bankName !== undefined) {
    fields.push(`bank_name = $${paramIndex++}`);
    values.push(updates.bankName);
  }
  if (updates.bankAddress !== undefined) {
    fields.push(`bank_address = $${paramIndex++}`);
    values.push(updates.bankAddress);
  }
  if (updates.cryptoAddress !== undefined) {
    fields.push(`crypto_address = $${paramIndex++}`);
    values.push(updates.cryptoAddress);
  }
  if (updates.cryptoNetwork !== undefined) {
    fields.push(`crypto_network = $${paramIndex++}`);
    values.push(updates.cryptoNetwork);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
    if (updates.status === 'active') {
      fields.push(`onboarding_completed_at = now()`);
    }
  }
  if (updates.terminationDate !== undefined) {
    fields.push(`termination_date = $${paramIndex++}`);
    values.push(updates.terminationDate);
  }
  if (updates.terminationReason !== undefined) {
    fields.push(`termination_reason = $${paramIndex++}`);
    values.push(updates.terminationReason);
  }
  
  fields.push(`updated_at = now()`);
  values.push(employeeId);
  
  await query(
    `update employees set ${fields.join(', ')} where id = $${paramIndex}`,
    values
  );
  
  return getEmployee(employeeId);
};

// Contract functions
export const createContract = async (employerId: string, employeeId: string, input: {
  contractType: 'full_time' | 'part_time' | 'contractor';
  startDate: string;
  endDate?: string;
  salaryAmount: number;
  salaryCurrency?: string;
  salaryFrequency: 'monthly' | 'bi_weekly' | 'weekly' | 'hourly';
  hourlyRate?: number;
  hoursPerWeek?: number;
  benefits?: Record<string, unknown>;
  probationPeriodMonths?: number;
  noticePeriodDays?: number;
}) => {
  const result = await query<{ id: string }>(
    `insert into employment_contracts (
      employer_id, employee_id, contract_type, start_date, end_date, salary_amount,
      salary_currency, salary_frequency, hourly_rate, hours_per_week, benefits,
      probation_period_months, notice_period_days
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
    returning id`,
    [
      employerId,
      employeeId,
      input.contractType,
      input.startDate,
      input.endDate ?? null,
      input.salaryAmount,
      input.salaryCurrency ?? 'USD',
      input.salaryFrequency,
      input.hourlyRate ?? null,
      input.hoursPerWeek ?? null,
      JSON.stringify(input.benefits ?? {}),
      input.probationPeriodMonths ?? null,
      input.noticePeriodDays ?? null
    ]
  );
  
  return { contractId: result.rows[0].id };
};

export const getContractByEmployee = async (employeeId: string) => {
  const result = await query(
    `select * from employment_contracts where employee_id = $1 and status = 'active' limit 1`,
    [employeeId]
  );
  
  return result.rows[0] ?? null;
};

export const listEmploymentContracts = async (employerId: string, status?: string) => {
  const params: unknown[] = [employerId];
  let queryStr = `
    select c.*,
           e.first_name,
           e.last_name,
           e.email,
           e.country_of_residence
      from employment_contracts c
      join employees e on e.id = c.employee_id
     where c.employer_id = $1`;

  if (status) {
    params.push(status);
    queryStr += ` and c.status = $${params.length}`;
  }

  queryStr += ` order by c.created_at desc`;
  return query(queryStr, params).then((res) => res.rows);
};

// Payroll run functions
export const createPayrollRun = async (employerId: string, input: {
  periodStart: string;
  periodEnd: string;
  scheduledPayDate: string;
}) => {
  return withTransaction(async (client) => {
    // Get next run number
    const lastRun = await client.query<{ run_number: number }>(
      `select run_number from payroll_runs where employer_id = $1 order by run_number desc limit 1`,
      [employerId]
    );
    
    const nextRunNumber = (lastRun.rows[0]?.run_number ?? 0) + 1;
    
    const result = await client.query<{ id: string }>(
      `insert into payroll_runs (
        employer_id, run_number, period_start, period_end, scheduled_pay_date, status
      ) values ($1, $2, $3, $4, $5, 'draft')
      returning id`,
      [employerId, nextRunNumber, input.periodStart, input.periodEnd, input.scheduledPayDate]
    );
    
    // Get active employees with contracts
    const employees = await client.query<{
      id: string;
      salary_amount: number;
      salary_currency: string;
      salary_frequency: string;
      hourly_rate: number;
      hours_per_week: number;
    }>(
      `select e.id, c.salary_amount, c.salary_currency, c.salary_frequency, c.hourly_rate, c.hours_per_week
       from employees e
       join employment_contracts c on c.employee_id = e.id
       where e.employer_id = $1 and e.status = 'active' and c.status = 'active'`,
      [employerId]
    );
    
    // Create payslips for each employee
    for (const emp of employees.rows) {
      const payslipNumber = `payslip_${nanoid(12)}`;
      let grossPay = 0;
      
      if (emp.salary_frequency === 'hourly' && emp.hourly_rate && emp.hours_per_week) {
        // Calculate based on hours (simplified - assumes 2 weeks for bi-weekly periods)
        const weeks = 2; // This should be calculated from period dates
        grossPay = emp.hourly_rate * emp.hours_per_week * weeks;
      } else {
        // Monthly/bi-weekly/weekly - simplified calculation
        grossPay = emp.salary_amount;
      }
      
      // Calculate net pay (simplified - 20% tax + 5% deductions)
      const taxes = grossPay * 0.20;
      const deductions = grossPay * 0.05;
      const netPay = grossPay - taxes - deductions;
      
      await client.query(
        `insert into payslips (
          payroll_run_id, employee_id, payslip_number, gross_pay, net_pay, currency,
          pay_date, earnings, deductions, taxes, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, 'pending')`,
        [
          result.rows[0].id,
          emp.id,
          payslipNumber,
          grossPay,
          netPay,
          emp.salary_currency,
          input.scheduledPayDate,
          JSON.stringify([{ type: 'salary', amount: grossPay, description: 'Base salary' }]),
          JSON.stringify([{ type: 'benefits', amount: deductions, description: 'Benefits deduction' }]),
          JSON.stringify([{ type: 'income_tax', amount: taxes, description: 'Income tax' }])
        ]
      );
    }
    
    // Update payroll run totals
    await client.query(
      `update payroll_runs
       set total_employees = (select count(*) from payslips where payroll_run_id = $1),
           total_gross_pay = (select sum(gross_pay) from payslips where payroll_run_id = $1),
           total_net_pay = (select sum(net_pay) from payslips where payroll_run_id = $1),
           total_taxes = (select sum((earnings->0->>'amount')::numeric) from payslips where payroll_run_id = $1),
           total_deductions = (select sum((deductions->0->>'amount')::numeric) from payslips where payroll_run_id = $1)
       where id = $1`,
      [result.rows[0].id]
    );
    
    return { payrollRunId: result.rows[0].id, runNumber: nextRunNumber };
  });
};

export const approvePayrollRun = async (payrollRunId: string, approvedBy: string) => {
  await query(
    `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
    [payrollRunId, approvedBy]
  );
  
  return getPayrollRun(payrollRunId);
};

export const processPayrollRun = async (payrollRunId: string, performedBy: string) => {
  return withTransaction(async (client) => {
    const payroll = await client.query<{
      id: string;
      employer_id: string;
      total_net_pay: number;
    }>(
      `select * from payroll_runs where id = $1 and status = 'approved' limit 1`,
      [payrollRunId]
    );
    
    if (!payroll.rows[0]) {
      throw new AppError(404, "payroll_not_found", "Payroll run not found or not approved");
    }
    
    // Update status to processing
    await client.query(
      `update payroll_runs set status = 'processing', processed_by = $2 where id = $1`,
      [payrollRunId, performedBy]
    );
    
    // Get payslips with employee crypto addresses
    const payslips = await client.query<{
      id: string;
      employee_id: string;
      net_pay: number;
      currency: string;
      crypto_address: string | null;
      crypto_network: string | null;
    }>(
      `select p.id, p.employee_id, p.net_pay, p.currency, e.crypto_address, e.crypto_network
       from payslips p
       join employees e on e.id = p.employee_id
       where p.payroll_run_id = $1 and p.status = 'pending'`,
      [payrollRunId]
    );
    
    // Create batch payout (only for employees with crypto addresses)
    const payouts = payslips.rows
      .filter((p): p is typeof p & { crypto_address: string } => p.crypto_address !== null)
      .map(p => ({
        destinationAddress: p.crypto_address,
        amountCrypto: p.net_pay,
        reference: `payslip_${p.id}`
      }));
    
    if (payouts.length === 0) {
      throw new AppError(400, "no_crypto_addresses", "No employees with crypto addresses found");
    }
    
    // Convert to USDT for batch payout (simplified - should use FX rates)
    const batch = await createBatchPayout({
      merchantId: payroll.rows[0].employer_id,
      asset: 'USDT',
      network: 'TRC20',
      payouts,
      description: `Payroll run ${payrollRunId}`
    });
    
    // Queue the batch payout. Withdrawal execution and final payroll settlement are owned by workers.
    await processBatchPayout(batch.batchId, performedBy);
    
    // Link batch payout to payroll run
    await client.query(
      `update payroll_runs set batch_payout_id = $2, status = 'processing' where id = $1`,
      [payrollRunId, batch.batchId]
    );

    return { payrollRunId, batchId: batch.batchId, status: 'processing' };
  });
};

export const getPayrollRun = async (payrollRunId: string) => {
  const result = await query(
    `select * from payroll_runs where id = $1 limit 1`,
    [payrollRunId]
  );
  
  return result.rows[0] ?? null;
};

export const listPayrollRuns = async (employerId: string, status?: string) => {
  let queryStr = `select * from payroll_runs where employer_id = $1`;
  const params: unknown[] = [employerId];
  
  if (status) {
    queryStr += ` and status = $2`;
    params.push(status);
  }
  
  queryStr += ` order by created_at desc limit 50`;
  
  return query(queryStr, params).then((res) => res.rows);
};

export const getPayslips = async (payrollRunId: string) => {
  const result = await query(
    `select p.*, e.first_name, e.last_name, e.email
     from payslips p
     join employees e on e.id = p.employee_id
     where p.payroll_run_id = $1
     order by p.created_at`,
    [payrollRunId]
  );
  
  return result.rows;
};

export const listPayslipsForEmployer = async (employerId: string, status?: string) => {
  const params: unknown[] = [employerId];
  let queryStr = `
    select p.*,
           pr.run_number,
           pr.period_start,
           pr.period_end,
           e.first_name,
           e.last_name,
           e.email
      from payslips p
      join payroll_runs pr on pr.id = p.payroll_run_id
      join employees e on e.id = p.employee_id
     where pr.employer_id = $1`;

  if (status) {
    params.push(status);
    queryStr += ` and p.status = $${params.length}`;
  }

  queryStr += ` order by p.created_at desc limit 200`;
  return query(queryStr, params).then((res) => res.rows);
};

export const listOnboardingDocuments = async (employerId: string, status?: string) => {
  const params: unknown[] = [employerId];
  let queryStr = `
    select d.*,
           e.first_name,
           e.last_name,
           e.email
      from onboarding_documents d
      join employees e on e.id = d.employee_id
     where e.employer_id = $1`;

  if (status) {
    params.push(status);
    queryStr += ` and d.status = $${params.length}`;
  }

  queryStr += ` order by d.created_at desc limit 200`;
  return query(queryStr, params).then((res) => res.rows);
};

// FX rate functions
export const getFxRate = async (fromCurrency: string, toCurrency: string) => {
  const result = await query<{ rate: number }>(
    `select rate from fx_rates
     where from_currency = $1 and to_currency = $2
     and (valid_until is null or valid_until > now())
     order by valid_from desc
     limit 1`,
    [fromCurrency, toCurrency]
  );
  
  return result.rows[0]?.rate ?? null;
};

export const updateFxRate = async (fromCurrency: string, toCurrency: string, rate: number, source: string = 'manual') => {
  await query(
    `insert into fx_rates (from_currency, to_currency, rate, source, valid_from)
     values ($1, $2, $3, $4, now())
     on conflict (from_currency, to_currency, valid_from) do update set
       rate = excluded.rate,
       source = excluded.source`,
    [fromCurrency, toCurrency, rate, source]
  );
  
  return getFxRate(fromCurrency, toCurrency);
};

// Chat integration functions
export const createChatIntegration = async (employerId: string, input: {
  platform: 'slack' | 'whatsapp' | 'telegram';
  workspaceId?: string;
  channelId?: string;
  botToken?: string;
  webhookUrl?: string;
  enabledCommands?: string[];
}) => {
  const result = await query<{ id: string }>(
    `insert into chat_integrations (
      employer_id, platform, workspace_id, channel_id, bot_token_enc, webhook_url, enabled_commands
    ) values ($1, $2, $3, $4, $5, $6, $7)
    returning id`,
    [
      employerId,
      input.platform,
      input.workspaceId ?? null,
      input.channelId ?? null,
      input.botToken ?? null,
      input.webhookUrl ?? null,
      input.enabledCommands ?? []
    ]
  );
  
  return { integrationId: result.rows[0].id };
};

export const listChatIntegrations = async (employerId: string) => {
  const result = await query(
    `select * from chat_integrations where employer_id = $1`,
    [employerId]
  );
  
  return result.rows;
};

export const logChatCommand = async (integrationId: string, input: {
  command: string;
  userId: string;
  channelId?: string;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
}) => {
  await query(
    `insert into chat_command_logs (integration_id, command, user_id, channel_id, payload, response, status, error_message)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      integrationId,
      input.command,
      input.userId,
      input.channelId ?? null,
      JSON.stringify(input.payload),
      JSON.stringify(input.response),
      input.status,
      input.errorMessage ?? null
    ]
  );
};
