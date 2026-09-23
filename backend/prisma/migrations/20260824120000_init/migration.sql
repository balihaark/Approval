-- Consolidated Baseline Migration for Approvals DB
-- Matches schema.prisma (central DB employees identity + approval workflow)

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('REGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('REQUESTER', 'APPROVER', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "employees" (
    "sr_no" SERIAL NOT NULL,
    "emp_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "designation" TEXT NOT NULL DEFAULT '',
    "department_id" TEXT,
    "manager_id" TEXT,
    "dob" DATE,
    "blood_group" TEXT,
    "permanent_address" TEXT,
    "local_address" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("emp_id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "department" TEXT,
    "project" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'REGISTERED',
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "gmailMessageId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "PartyRole" NOT NULL,
    "sequenceOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "decision" "DecisionOutcome" NOT NULL,
    "reason" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnprocessedMail" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "fromAddress" TEXT,
    "snippet" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "UnprocessedMail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "messageIdHeader" TEXT,
    "threadId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "historyId" TEXT,
    "watchExpiry" TIMESTAMP(3),
    "lastReconcileAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_threadId_key" ON "Approval"("threadId");

-- CreateIndex
CREATE INDEX "Approval_state_idx" ON "Approval"("state");
CREATE INDEX "Approval_department_idx" ON "Approval"("department");
CREATE INDEX "Approval_project_idx" ON "Approval"("project");
CREATE INDEX "Approval_lastActivityAt_idx" ON "Approval"("lastActivityAt");
CREATE INDEX "Approval_createdAt_idx" ON "Approval"("createdAt");

-- CreateIndex
CREATE INDEX "Party_email_idx" ON "Party"("email");
CREATE INDEX "Party_role_idx" ON "Party"("role");
CREATE UNIQUE INDEX "Party_approvalId_email_role_key" ON "Party"("approvalId", "email", "role");

-- CreateIndex
CREATE INDEX "Decision_approvalId_idx" ON "Decision"("approvalId");

-- CreateIndex
CREATE INDEX "ActivityLog_approvalId_idx" ON "ActivityLog"("approvalId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnprocessedMail_gmailMessageId_key" ON "UnprocessedMail"("gmailMessageId");
CREATE INDEX "UnprocessedMail_resolvedAt_idx" ON "UnprocessedMail"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_gmailMessageId_key" ON "ProcessedMessage"("gmailMessageId");
CREATE INDEX "ProcessedMessage_threadId_idx" ON "ProcessedMessage"("threadId");
CREATE INDEX "ProcessedMessage_messageIdHeader_idx" ON "ProcessedMessage"("messageIdHeader");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
