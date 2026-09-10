import { config } from "../config.js";

export type CentralEmployee = {
  emp_id: number | string;
  employee_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
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
  return request<CentralEmployee>(`/api/employees/by-email?${q}`);
}

export async function getEmployeeById(
  empId: bigint | number | string
): Promise<CentralEmployee | null> {
  return request<CentralEmployee>(`/api/employees/${empId}`);
}

export function fullName(row: CentralEmployee | null | undefined): string {
  if (!row) return "";
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
}
