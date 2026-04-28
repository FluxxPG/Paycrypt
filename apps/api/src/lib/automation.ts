import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { nanoid } from "nanoid";

export type TriggerEventType =
  | "payment.confirmed"
  | "payment.failed"
  | "payment.expired"
  | "withdrawal.requested"
  | "withdrawal.completed"
  | "withdrawal.failed"
  | "balance.low"
  | "balance.high"
  | "settlement.completed";

export type ActionType =
  | "send_webhook"
  | "send_email"
  | "create_withdrawal"
  | "create_adjustment"
  | "block_merchant"
  | "alert_admin";

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: TriggerEventType;
  conditions: Record<string, unknown>;
  actions: Array<{
    type: ActionType;
    params: Record<string, unknown>;
  }>;
  is_active: boolean;
  merchant_id: string | null;
  created_at: string;
  updated_at: string;
}

export const createAutomationRule = async (input: {
  name: string;
  description?: string;
  triggerEvent: TriggerEventType;
  conditions: Record<string, unknown>;
  actions: Array<{ type: ActionType; params: Record<string, unknown> }>;
  merchantId?: string;
}) => {
  const ruleId = `rule_${nanoid(16)}`;

  const result = await query<{ id: string }>(
    `insert into automation_rules (id, name, description, trigger_event, conditions, actions, merchant_id, is_active)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, true)
     returning id`,
    [ruleId, input.name, input.description ?? null, input.triggerEvent, JSON.stringify(input.conditions), JSON.stringify(input.actions), input.merchantId ?? null]
  );

  return { id: result.rows[0].id };
};

export const evaluateAutomationRules = async (eventType: TriggerEventType, eventData: Record<string, unknown>) => {
  // Get all active rules for this event type
  const rules = await query<AutomationRule>(
    `select * from automation_rules
     where trigger_event = $1 and is_active = true
     order by created_at desc`,
    [eventType]
  );

  const results: Array<{ ruleId: string; ruleName: string; executed: boolean; error?: string }> = [];

  for (const rule of rules.rows) {
    try {
      // Evaluate conditions
      const conditionsMet = evaluateConditions(rule.conditions, eventData);

      if (conditionsMet) {
        // Execute actions
        await executeActions(rule.actions, eventData);
        results.push({ ruleId: rule.id, ruleName: rule.name, executed: true });
      } else {
        results.push({ ruleId: rule.id, ruleName: rule.name, executed: false });
      }
    } catch (error) {
      results.push({ ruleId: rule.id, ruleName: rule.name, executed: false, error: (error as Error).message });
    }
  }

  return results;
};

const evaluateConditions = (conditions: Record<string, unknown>, eventData: Record<string, unknown>): boolean => {
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = getNestedValue(eventData, key);

    if (typeof expectedValue === "object" && expectedValue !== null) {
      // Handle operators
      const conditionObj = expectedValue as { operator: string; value: unknown };
      const { operator, value } = conditionObj;

      switch (operator) {
        case "eq":
          if (actualValue !== value) return false;
          break;
        case "neq":
          if (actualValue === value) return false;
          break;
        case "gt":
          if (typeof actualValue !== "number" || typeof value !== "number" || actualValue <= value) return false;
          break;
        case "lt":
          if (typeof actualValue !== "number" || typeof value !== "number" || actualValue >= value) return false;
          break;
        case "gte":
          if (typeof actualValue !== "number" || typeof value !== "number" || actualValue < value) return false;
          break;
        case "lte":
          if (typeof actualValue !== "number" || typeof value !== "number" || actualValue > value) return false;
          break;
        case "contains":
          if (typeof actualValue !== "string" || !actualValue.includes(String(value))) return false;
          break;
        case "exists":
          if (actualValue === undefined || actualValue === null) return false;
          break;
        default:
          return false;
      }
    } else {
      // Simple equality check
      if (actualValue !== expectedValue) return false;
    }
  }

  return true;
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
};

const executeActions = async (actions: Array<{ type: ActionType; params: Record<string, unknown> }>, eventData: Record<string, unknown>) => {
  for (const action of actions) {
    switch (action.type) {
      case "send_webhook":
        await executeWebhookAction(action.params, eventData);
        break;
      case "send_email":
        await executeEmailAction(action.params, eventData);
        break;
      case "create_withdrawal":
        await executeWithdrawalAction(action.params, eventData);
        break;
      case "create_adjustment":
        await executeAdjustmentAction(action.params, eventData);
        break;
      case "block_merchant":
        await executeBlockMerchantAction(action.params, eventData);
        break;
      case "alert_admin":
        await executeAlertAdminAction(action.params, eventData);
        break;
    }
  }
};

const executeWebhookAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  const { url, headers } = params;
  if (!url || typeof url !== "string") {
    throw new Error("Webhook URL is required");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> ?? {})
    },
    body: JSON.stringify(eventData)
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }
};

const executeEmailAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  // Placeholder for email sending logic
  // This would integrate with an email service like SendGrid, AWS SES, etc.
  console.log("Email action executed:", { params, eventData });
};

const executeWithdrawalAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  // Placeholder for withdrawal action
  // This would integrate with the treasury system
  console.log("Withdrawal action executed:", { params, eventData });
};

const executeAdjustmentAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  // Placeholder for adjustment action
  // This would integrate with the treasury system
  console.log("Adjustment action executed:", { params, eventData });
};

const executeBlockMerchantAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  const { merchantId } = params;
  if (!merchantId || typeof merchantId !== "string") {
    throw new Error("Merchant ID is required");
  }

  await query(
    `update merchants set status = 'blocked', updated_at = now() where id = $1`,
    [merchantId]
  );
};

const executeAlertAdminAction = async (params: Record<string, unknown>, eventData: Record<string, unknown>) => {
  const { severity, message } = params;
  if (!message || typeof message !== "string") {
    throw new Error("Alert message is required");
  }

  await query(
    `insert into system_alerts (severity, source, message, metadata)
     values ($1, 'automation', $2, $3::jsonb)`,
    [severity ?? "info", message, JSON.stringify(eventData)]
  );
};

export const listAutomationRules = async (merchantId?: string) => {
  let queryStr = `select * from automation_rules where is_active = true`;
  const params: unknown[] = [];

  if (merchantId) {
    queryStr += ` and (merchant_id = $1 or merchant_id is null)`;
    params.push(merchantId);
  }

  queryStr += ` order by created_at desc`;

  return query(queryStr, params).then((res) => res.rows);
};

export const updateAutomationRule = async (ruleId: string, input: {
  name?: string;
  description?: string;
  conditions?: Record<string, unknown>;
  actions?: Array<{ type: ActionType; params: Record<string, unknown> }>;
  isActive?: boolean;
}) => {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(input.description);
  }
  if (input.conditions !== undefined) {
    updates.push(`conditions = $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(input.conditions));
  }
  if (input.actions !== undefined) {
    updates.push(`actions = $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(input.actions));
  }
  if (input.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    params.push(input.isActive);
  }

  updates.push(`updated_at = now()`);
  params.push(ruleId);

  const result = await query(
    `update automation_rules set ${updates.join(", ")} where id = $${paramIndex} returning id`,
    params
  );

  if (!result.rows[0]) {
    throw new AppError(404, "rule_not_found", "Automation rule not found");
  }

  return { id: ruleId };
};

export const deleteAutomationRule = async (ruleId: string) => {
  await query(`delete from automation_rules where id = $1`, [ruleId]);
  return { success: true };
};

export const getAutomationRule = async (ruleId: string) => {
  const result = await query<AutomationRule>(
    `select * from automation_rules where id = $1 limit 1`,
    [ruleId]
  );

  return result.rows[0] ?? null;
};
