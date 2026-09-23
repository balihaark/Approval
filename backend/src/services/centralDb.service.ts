import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

export type CentralEmployee = {
  sr_no?: number;
  emp_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  designation?: string | null;
  department_id?: string | null;
  manager_id?: string | null;
  dob?: string | Date | null;
  blood_group?: string | null;
  permanent_address?: string | null;
  local_address?: string | null;
  employee_code?: string | null;
  employment_status?: string | null;
  is_active?: boolean | null;
};

export class CentralDbError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 5_000;

function headers(): HeadersInit {
  if (!config.approvalsApiKey) {
    throw new CentralDbError("APPROVALS_API_KEY not configured", 500);
  }
  return {
    "x-api-key": config.approvalsApiKey,
    accept: "application/json",
  };
}

async function request<T>(path: string): Promise<T | null> {
  const url = `${config.centralDbUrl}${path}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { headers: headers(), signal: ac.signal });
  } catch (err) {
    throw new CentralDbError(
      `central_db unreachable: ${(err as Error).message}`,
      504
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CentralDbError(
      `central_db ${res.status} on ${path}: ${body.slice(0, 200)}`,
      res.status
    );
  }
  return (await res.json()) as T;
}

export async function getEmployeeByEmail(
  email: string
): Promise<CentralEmployee | null> {
  const q = new URLSearchParams({ email }).toString();
  try {
    return await request<CentralEmployee>(`/api/employees/by-email?${q}`);
  } catch (err) {
    if (config.isDev && config.mockCentralDb && err instanceof CentralDbError) {
      const existing = await prisma.employee.findFirst({ where: { email } });
      const emp_id = existing
        ? existing.employeeId
        : `EMP-${Math.floor(Date.now() / 1000)}`;
      return {
        emp_id,
        email,
        first_name: existing?.firstName || email.split("@")[0],
        last_name: existing?.lastName || "User",
        phone: existing?.phone || null,
        designation: existing?.designation || "Employee",
        department_id: existing?.departmentId || null,
        manager_id: existing?.managerId || null,
        is_active: existing ? existing.isActive : true,
        employment_status: "ACTIVE",
      };
    }
    throw err;
  }
}

export async function getEmployeeById(
  empId: string
): Promise<CentralEmployee | null> {
  try {
    return await request<CentralEmployee>(`/api/employees/${empId}`);
  } catch (err) {
    if (config.isDev && config.mockCentralDb && err instanceof CentralDbError) {
      const sId = String(empId);
      const existing = await prisma.employee.findUnique({
        where: { employeeId: sId },
      });
      if (existing) {
        return {
          emp_id: existing.employeeId,
          email: existing.email,
          first_name: existing.firstName,
          last_name: existing.lastName,
          phone: existing.phone,
          designation: existing.designation,
          department_id: existing.departmentId,
          manager_id: existing.managerId,
          is_active: existing.isActive,
          employment_status: existing.isActive ? "ACTIVE" : "INACTIVE",
        };
      }
      return {
        emp_id: sId,
        email: "dev@blauplug.com",
        first_name: "Dev",
        last_name: "User",
        designation: "Developer",
        is_active: true,
        employment_status: "ACTIVE",
      };
    }
    throw err;
  }
}

export function fullName(row: CentralEmployee | null | undefined): string {
  if (!row) return "";
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
}
