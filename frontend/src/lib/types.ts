export type User = {
  id: number | string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  mustChangePassword?: boolean;
};

export type Party = {
  email: string;
  name: string | null;
  role: "REQUESTER" | "APPROVER" | "PARTICIPANT";
  sequenceOrder?: number | null;
};

export type Decision = {
  id: string;
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
  decidedBy: string;
  decidedAt: string;
};

export type Approval = {
  id: string;
  subject: string;
  body: string;
  summary: string | null;
  department: string | null;
  project: string | null;
  state: "REGISTERED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  stateLabel: string;
  threadId: string;
  createdAt: string;
  lastActivityAt: string;
  requester: { email: string; name: string | null } | null;
  approvers: { email: string; name: string | null; sequenceOrder?: number | null }[];
  participants: { email: string; name: string | null }[];
  parties: Party[];
  decisions: Decision[];
};

export type ActivityItem = {
  id: string;
  actorEmail: string;
  action: string;
  details: unknown;
  createdAt: string;
};

export type UnprocessedMail = {
  id: string;
  gmailMessageId: string;
  threadId: string | null;
  subject: string | null;
  fromAddress: string | null;
  snippet: string | null;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};
