import { Router } from "express";
import { requireJwt, redisRateLimit, requirePasswordSetupComplete } from "../lib/middleware.js";
import {
  createEmployer,
  getEmployerOverview,
  getEmployerByMerchantId,
  updateEmployer,
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  createContract,
  getContractByEmployee,
  listEmploymentContracts,
  createPayrollRun,
  approvePayrollRun,
  processPayrollRun,
  getPayrollRun,
  listPayrollRuns,
  getPayslips,
  listPayslipsForEmployer,
  listOnboardingDocuments,
  getFxRate,
  updateFxRate,
  createChatIntegration,
  listChatIntegrations,
  logChatCommand
} from "../lib/eor.js";

export const employerRouter = Router();

employerRouter.use(requireJwt, requirePasswordSetupComplete, redisRateLimit("employer", 300, 60));

// Employer profile
employerRouter.get("/overview", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json({ data: await getEmployerOverview(merchantId) });
});

employerRouter.get("/profile", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  res.json({ data: employer });
});

employerRouter.post("/profile", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  
  if (employer) {
    const updated = await updateEmployer(employer.id, req.body);
    res.json({ data: updated });
  } else {
    const created = await createEmployer({ merchantId, ...req.body });
    res.json({ data: created });
  }
});

employerRouter.patch("/profile", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const updated = await updateEmployer(employer.id, req.body);
  res.json({ data: updated });
});

// Employees
employerRouter.get("/employees", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const { status } = req.query;
  const employees = await listEmployees(employer.id, status as string);
  res.json({ data: employees });
});

employerRouter.post("/employees", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const created = await createEmployee(employer.id, req.body);
  res.json({ data: created });
});

employerRouter.get("/employees/:id", async (req, res) => {
  const employee = await getEmployee(req.params.id);
  if (!employee) {
    return res.status(404).json({ message: "Employee not found" });
  }
  res.json({ data: employee });
});

employerRouter.patch("/employees/:id", async (req, res) => {
  const updated = await updateEmployee(req.params.id, req.body);
  res.json({ data: updated });
});

// Contracts
employerRouter.get("/contracts", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const { status } = req.query;
  const contracts = await listEmploymentContracts(employer.id, status as string);
  res.json({ data: contracts });
});

employerRouter.post("/employees/:employeeId/contract", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const created = await createContract(employer.id, req.params.employeeId, req.body);
  res.json({ data: created });
});

employerRouter.get("/employees/:employeeId/contract", async (req, res) => {
  const contract = await getContractByEmployee(req.params.employeeId);
  if (!contract) {
    return res.status(404).json({ message: "Contract not found" });
  }
  res.json({ data: contract });
});

// Payroll runs
employerRouter.get("/payroll", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const { status } = req.query;
  const runs = await listPayrollRuns(employer.id, status as string);
  res.json({ data: runs });
});

employerRouter.post("/payroll", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const created = await createPayrollRun(employer.id, req.body);
  res.json({ data: created });
});

employerRouter.get("/payroll/:id", async (req, res) => {
  const run = await getPayrollRun(req.params.id);
  if (!run) {
    return res.status(404).json({ message: "Payroll run not found" });
  }
  res.json({ data: run });
});

employerRouter.post("/payroll/:id/approve", async (req, res) => {
  const approvedBy = (req as any).actor.userId;
  const updated = await approvePayrollRun(req.params.id, approvedBy);
  res.json({ data: updated });
});

employerRouter.post("/payroll/:id/process", async (req, res) => {
  const performedBy = (req as any).actor.userId;
  const result = await processPayrollRun(req.params.id, performedBy);
  res.json({ data: result });
});

employerRouter.get("/payroll/:id/payslips", async (req, res) => {
  const payslips = await getPayslips(req.params.id);
  res.json({ data: payslips });
});

employerRouter.get("/payslips", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const { status } = req.query;
  const payslips = await listPayslipsForEmployer(employer.id, status as string);
  res.json({ data: payslips });
});

employerRouter.get("/documents", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const { status } = req.query;
  const documents = await listOnboardingDocuments(employer.id, status as string);
  res.json({ data: documents });
});

// FX rates
employerRouter.get("/fx-rates", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ message: "from and to currencies are required" });
  }
  const rate = await getFxRate(from as string, to as string);
  if (!rate) {
    return res.status(404).json({ message: "FX rate not found" });
  }
  res.json({ data: { from, to, rate } });
});

// Chat integrations
employerRouter.get("/integrations/chat", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const integrations = await listChatIntegrations(employer.id);
  res.json({ data: integrations });
});

employerRouter.post("/integrations/chat", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const employer = await getEmployerByMerchantId(merchantId);
  if (!employer) {
    return res.status(404).json({ message: "Employer profile not found" });
  }
  const created = await createChatIntegration(employer.id, req.body);
  res.json({ data: created });
});

employerRouter.post("/integrations/chat/:id/command", async (req, res) => {
  const { command, userId, channelId, payload, response, status, errorMessage } = req.body;
  await logChatCommand(req.params.id, {
    command,
    userId,
    channelId,
    payload,
    response,
    status,
    errorMessage
  });
  res.json({ success: true });
});
